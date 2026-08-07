/**
 * src/lib/duplicate-detector.ts
 * ---------------------------------------------------------------------------
 * Lightweight near-duplicate detection for bottle submissions, to stop
 * copy-paste spam floods from the same anonymous session.
 *
 * Approach (per spec: "simple similarity check, e.g. Levenshtein distance
 * threshold"):
 *   - Normalise both strings: lowercase, trim, collapse internal whitespace.
 *     (We don't strip punctuation/diacritics — those carry meaning in short
 *      messages, and over-normalising would inflate false positives.)
 *   - Compute the Levenshtein edit distance between the normalised strings.
 *   - Convert to a similarity ratio: `distance / max(len_a, len_b)`.
 *   - If the ratio <= DUPLICATE_THRESHOLD, the submission is a near-duplicate.
 *
 * Threshold tuning: 0.20 means two strings that differ by at most 20% of the
 * longer one's length are considered duplicates. Exact copies are 0.0; a
 * couple of typo-edits on a 100-char message (~0.04) is still caught; a
 * genuinely different message is well above 0.20. Only applied when both
 * normalised strings are at least MIN_COMPARE_LEN chars (the composer's min is
 * 10), so tiny messages aren't over-blocked by a single edit.
 *
 * The comparison set is the session's recent submissions (queried from the DB
 * by the route, then passed here). Keeping this pure + synchronous makes it
 * trivial to test and keeps the DB query in the route where it belongs.
 * -------------------------------------------------------------------------
 */

/** Max edit-distance ratio (0..1) for two submissions to count as duplicates. */
export const DUPLICATE_THRESHOLD = 0.2;

/** Don't run the comparison for strings shorter than this (avoids noise). */
export const MIN_COMPARE_LEN = 10;

/**
 * Normalise a string for comparison: lowercase, trim, collapse whitespace.
 */
export function normalizeForCompare(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Iterative Levenshtein edit distance. O(m*n) time, O(min(m,n)) space.
 * For bottle messages (<=500 chars) this is at most ~250k ops — negligible.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep `prev` as the shorter row to minimise space.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let prev = new Array<number>(shorter.length + 1);
  let curr = new Array<number>(shorter.length + 1);
  for (let i = 0; i <= shorter.length; i++) prev[i] = i;

  for (let j = 1; j <= longer.length; j++) {
    curr[0] = j;
    const longerChar = longer.charCodeAt(j - 1);
    for (let i = 1; i <= shorter.length; i++) {
      const cost = shorter.charCodeAt(i - 1) === longerChar ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1, // insertion
        prev[i] + 1, // deletion
        prev[i - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[shorter.length];
}

/**
 * Similarity ratio in [0,1]: 0 = identical, 1 = totally different.
 * `distance / max(len_a, len_b)`. When both lengths are 0, ratio is 0.
 */
export function distanceRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a, b) / maxLen;
}

export interface DuplicateMatch {
  /** The matching recent text (normalised). */
  matched: string;
  /** The edit-distance ratio (0 = identical). */
  ratio: number;
}

/**
 * Find the closest near-duplicate of `content` among `recentTexts`.
 * Returns the match if one is within the threshold, else `null`. Only
 * compares strings that meet MIN_COMPARE_LEN after normalisation.
 */
export function findNearDuplicate(
  content: string,
  recentTexts: string[],
  threshold: number = DUPLICATE_THRESHOLD,
): DuplicateMatch | null {
  const norm = normalizeForCompare(content);
  if (norm.length < MIN_COMPARE_LEN) return null;

  let best: DuplicateMatch | null = null;
  for (const raw of recentTexts) {
    const r = normalizeForCompare(raw);
    if (r.length < MIN_COMPARE_LEN) continue;
    const ratio = distanceRatio(norm, r);
    if (ratio <= threshold && (best === null || ratio < best.ratio)) {
      best = { matched: r, ratio };
    }
  }
  return best;
}
