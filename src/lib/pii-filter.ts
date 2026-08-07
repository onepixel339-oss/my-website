/**
 * src/lib/pii-filter.ts
 * ---------------------------------------------------------------------------
 * Server-side PII (personally identifiable information) detection that runs on
 * EVERY submitted message and quick reply BEFORE storage.
 *
 * Design intent:
 *   - This is a synchronous, cheap (regex-based) gate that runs BEFORE the
 *     moderation classifier and BEFORE any INSERT. If PII is detected, the
 *     submission is REJECTED — never silently stripped, never stored.
 *   - PII-containing text must never reach the moderation audit log either
 *     (that log is for moderation decisions, not for capturing contact info),
 *     so this gate short-circuits before moderation runs.
 *   - On rejection, the author sees the exact notice:
 *       "Your message seems to include contact info or a link — bottles here
 *        stay anonymous, please remove it and try again."
 *     plus the detected portions highlighted. Showing the author their OWN
 *     text is safe (they wrote it) and is required for good UX; this is
 *     distinct from the moderation trigger-word rule (which never reveals
 *     matched content to end users).
 *
 * Detected categories:
 *   - phone            international phone numbers (+, separators, >=7 digits)
 *   - email            standard email addresses
 *   - url              http(s)://, www., and bare domains with known TLDs
 *   - social_handle    @username patterns (excludes the @ in emails)
 *   - long_numeric_id  8+ consecutive digits (national IDs, card numbers, etc.)
 *
 * The function returns finding spans (start/end offsets + snippet) so the UI
 * can highlight the detected portions in the author's text.
 * ---------------------------------------------------------------------------
 */

export type PiiCategory =
  | "phone"
  | "email"
  | "url"
  | "social_handle"
  | "long_numeric_id";

export interface PiiFinding {
  category: PiiCategory;
  /** The matched text (author's own input — safe to show back to them). */
  snippet: string;
  /** Start offset in the original text. */
  start: number;
  /** End offset (exclusive) in the original text. */
  end: number;
}

export interface PiiDetectionResult {
  detected: boolean;
  findings: PiiFinding[];
}

/** The exact rejection notice shown to the author (per spec). */
export const PII_REJECTION_NOTICE =
  "Your message seems to include contact info or a link — bottles here stay anonymous, please remove it and try again.";

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Common TLDs for bare-domain URL detection. Deliberately excludes file
 *  extensions (jpg, pdf, png) to avoid false positives on filenames. */
const KNOWN_TLDS =
  "(?:com|net|org|io|co|me|app|dev|xyz|info|biz|edu|gov|mil|us|uk|gb|de|fr|it|es|nl|ca|au|in|br|ru|cn|jp|kr|eg|sa|ae|ly|ma|dz|tn|pk|id|ph|vn|th|my|sg|hk|tw|tr|iq|jo|kw|qa|bh|om|ye|sd|so|ke|ng|za|gh|tv|fm|to|cc|ws)";

interface RawPattern {
  category: PiiCategory;
  regex: RegExp;
  /** Optional post-match validator (e.g. min digit count for phones). */
  validate?: (matched: string) => boolean;
}

/**
 * Order matters for overlap deduplication: earlier patterns take priority over
 * later ones when spans overlap. Email is first so its `@` is not also claimed
 * by social_handle; url before social_handle so domains aren't fragment-matched.
 */
const RAW_PATTERNS: RawPattern[] = [
  // Email — standard, reliable.
  {
    category: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  // URL with protocol.
  {
    category: "url",
    regex: /https?:\/\/[^\s<>"']+/gi,
  },
  // www. URLs (no protocol).
  {
    category: "url",
    regex: /\bwww\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"']*)?/gi,
  },
  // Bare domains with known TLDs + optional path (e.g. instagram.com/user).
  // The trailing `(?![a-zA-Z0-9])` ensures the TLD isn't a prefix of a longer
  // token (e.g. "jpg" should NOT match as "jp" + "g").
  {
    category: "url",
    regex: new RegExp(
      `\\b[a-zA-Z0-9-]+\\.${KNOWN_TLDS}(?![a-zA-Z0-9])(?:\\/[^\\s<>"']*)?`,
      "gi",
    ),
  },
  // Social handles: @username (3+ word chars). The negative lookbehind on \w
  // excludes the @ inside emails (which is preceded by the local-part word).
  {
    category: "social_handle",
    regex: /(?<!\w)@[a-zA-Z0-9_]{3,}/g,
  },
  // Phone numbers: optional +, then digit-led run with separators, ending in a
  // digit. Validated post-match to require >=7 digits AND (a + prefix OR a
  // separator) so pure digit runs are left to long_numeric_id.
  {
    category: "phone",
    regex: /\+?\d[\d\s\-().]{5,}\d/g,
    validate: (m) => {
      const digits = (m.match(/\d/g) || []).length;
      if (digits < 7) return false;
      return m.startsWith("+") || /[\s\-().]/.test(m);
    },
  },
  // Long numeric IDs: 8+ consecutive digits (national IDs, card numbers, etc.)
  {
    category: "long_numeric_id",
    regex: /\b\d{8,}\b/g,
  },
];

// ---------------------------------------------------------------------------
// Detection core
// ---------------------------------------------------------------------------

function countDigits(s: string): number {
  return (s.match(/\d/g) || []).length;
}

function collectRaw(text: string): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const p of RAW_PATTERNS) {
    // matchAll requires a global regex and does not rely on lastIndex, but
    // reset it defensively in case a regex object was reused.
    p.regex.lastIndex = 0;
    for (const m of text.matchAll(p.regex)) {
      const matched = m[0];
      if (p.validate && !p.validate(matched)) continue;
      const start = m.index ?? 0;
      const end = start + matched.length;
      out.push({
        category: p.category,
        // Cap snippet length for tidy display; full span is in start/end.
        snippet: matched.length > 48 ? matched.slice(0, 48) + "\u2026" : matched,
        start,
        end,
      });
    }
  }
  return out;
}

/**
 * Drop findings that overlap an already-accepted (higher-priority, earlier)
 * finding. Non-overlapping findings within the same category are all kept.
 */
function dedupeOverlaps(findings: PiiFinding[]): PiiFinding[] {
  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PiiFinding[] = [];
  for (const f of sorted) {
    const overlaps = kept.some((k) => f.start < k.end && f.end > k.start);
    if (!overlaps) kept.push(f);
  }
  return kept;
}

/**
 * Detect PII in a text string. Pure, synchronous, side-effect-free.
 */
export function detectPii(text: string): PiiDetectionResult {
  const findings = dedupeOverlaps(collectRaw(text ?? ""));
  return { detected: findings.length > 0, findings };
}

/**
 * The function called before storage. Returns either `{ ok: true }` or a
 * rejection payload containing the notice + findings (for UI highlighting).
 */
export type PiiFilterResult =
  | { ok: true }
  | { ok: false; rejection: { notice: string; findings: PiiFinding[] } };

export function filterMessage(text: string): PiiFilterResult {
  const detection = detectPii(text);
  if (!detection.detected) return { ok: true };
  return {
    ok: false,
    rejection: { notice: PII_REJECTION_NOTICE, findings: detection.findings },
  };
}

/** Human-readable label for a category, for UI display. */
export function piiCategoryLabel(category: PiiCategory): string {
  switch (category) {
    case "phone":
      return "phone number";
    case "email":
      return "email address";
    case "url":
      return "link";
    case "social_handle":
      return "social handle";
    case "long_numeric_id":
      return "long number / ID";
  }
}
