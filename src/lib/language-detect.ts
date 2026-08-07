/**
 * src/lib/language-detect.ts
 * ---------------------------------------------------------------------------
 * Lightweight, dependency-free language detection for the bottle app.
 *
 * The bottle app accepts messages from anywhere in the world, and the
 * composer spec asks for the message `language` to be auto-detected and
 * stored alongside the content (to help with later matching). Rather than
 * pull in a heavyweight NLP library, we use a Unicode-script heuristic:
 *
 *   1. Tally how many characters of the trimmed text fall into each major
 *      script block (Arabic, CJK, Hiragana/Katakana, Hangul, Cyrillic,
 *      Devanagari, Greek, Hebrew, Thai).
 *   2. If a non-Latin script dominates (>= 15% of letters and is the
 *      single largest non-Latin block), return that script's language code.
 *   3. Otherwise default to English ("en").
 *
 * This is intentionally coarse — it identifies *script* more than
 * *language* (e.g. Cyrillic → "ru" rather than "uk"/"bg"), which is the
 * right granularity for "help match this bottle" and for a small language
 * badge in the feed. It never throws and always returns a 2-letter code.
 * ---------------------------------------------------------------------------
 */

/**
 * The set of language codes `detectLanguage` can return. Precise (a union,
 * not `string`) so callers get compile-time guarantees about the detector's
 * output contract. The DB `language` column is a plain `String` (it may hold
 * legacy / unknown values), so code that READS language from the DB should
 * type it as `string`, not `LanguageCode`.
 */
export type LanguageCode =
  | "en"
  | "ar"
  | "zh"
  | "ja"
  | "ko"
  | "ru"
  | "hi"
  | "el"
  | "he"
  | "th";

interface ScriptTally {
  arabic: number;
  cjk: number;
  kana: number;
  hangul: number;
  cyrillic: number;
  devanagari: number;
  greek: number;
  hebrew: number;
  thai: number;
  latin: number;
}

function emptyTally(): ScriptTally {
  return {
    arabic: 0,
    cjk: 0,
    kana: 0,
    hangul: 0,
    cyrillic: 0,
    devanagari: 0,
    greek: 0,
    hebrew: 0,
    thai: 0,
    latin: 0,
  };
}

function classifyCodePoint(cp: number, tally: ScriptTally): void {
  // Skip combining marks / punctuation / digits / whitespace — only tally
  // actual letter-bearing scripts so the percentages are meaningful.
  if (cp >= 0x0600 && cp <= 0x06ff) tally.arabic++;
  else if (cp >= 0x0750 && cp <= 0x077f) tally.arabic++;
  else if (cp >= 0x08a0 && cp <= 0x08ff) tally.arabic++;
  else if (cp >= 0xfb50 && cp <= 0xfdff) tally.arabic++;
  else if (cp >= 0xfe70 && cp <= 0xfeff) tally.arabic++;
  else if (cp >= 0x4e00 && cp <= 0x9fff) tally.cjk++; // CJK Unified Ideographs
  else if (cp >= 0x3400 && cp <= 0x4dbf) tally.cjk++; // CJK Extension A
  else if (cp >= 0x3040 && cp <= 0x309f) tally.kana++; // Hiragana
  else if (cp >= 0x30a0 && cp <= 0x30ff) tally.kana++; // Katakana
  else if (cp >= 0xac00 && cp <= 0xd7af) tally.hangul++; // Hangul Syllables
  else if (cp >= 0x1100 && cp <= 0x11ff) tally.hangul++; // Hangul Jamo
  else if (cp >= 0x0400 && cp <= 0x04ff) tally.cyrillic++;
  else if (cp >= 0x0900 && cp <= 0x097f) tally.devanagari++;
  else if (cp >= 0x0370 && cp <= 0x03ff) tally.greek++;
  else if (cp >= 0x0590 && cp <= 0x05ff) tally.hebrew++;
  else if (cp >= 0x0e00 && cp <= 0x0e7f) tally.thai++;
  else if (cp >= 0x0041 && cp <= 0x005a) tally.latin++; // A-Z
  else if (cp >= 0x0061 && cp <= 0x007a) tally.latin++; // a-z
  else if (cp >= 0x00c0 && cp <= 0x024f) tally.latin++; // Latin Extended (à, é, ñ, ü…)
}

/**
 * Detect the dominant language of `text`. Returns a 2-letter ISO 639-1 code.
 * Never throws — returns "en" for empty / unclassifiable input.
 */
export function detectLanguage(text: string): LanguageCode {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "en";

  const tally = emptyTally();
  for (const ch of trimmed) {
    classifyCodePoint(ch.codePointAt(0) ?? 0, tally);
  }

  // Total letter-bearing characters we recognised.
  const totalLetters =
    tally.arabic +
    tally.cjk +
    tally.kana +
    tally.hangul +
    tally.cyrillic +
    tally.devanagari +
    tally.greek +
    tally.hebrew +
    tally.thai +
    tally.latin;

  if (totalLetters === 0) return "en";

  // Pick the largest non-Latin block.
  const nonLatin: { code: LanguageCode; count: number }[] = [
    { code: "ar", count: tally.arabic },
    { code: "zh", count: tally.cjk },
    { code: "ja", count: tally.kana },
    { code: "ko", count: tally.hangul },
    { code: "ru", count: tally.cyrillic },
    { code: "hi", count: tally.devanagari },
    { code: "el", count: tally.greek },
    { code: "he", count: tally.hebrew },
    { code: "th", count: tally.thai },
  ];
  nonLatin.sort((a, b) => b.count - a.count);
  const top = nonLatin[0];

  // Require the dominant non-Latin script to be a meaningful share (>=15%)
  // before we override the English default. This keeps short messages with
  // a stray emoji or symbol from being misclassified.
  if (top && top.count / totalLetters >= 0.15) {
    return top.code;
  }

  // Special case: Japanese often mixes kanji (CJK) + kana. If kana is
  // present at all (even a little), prefer "ja" over "zh".
  if (tally.kana > 0 && tally.cjk > 0) return "ja";

  return "en";
}

/**
 * Human-readable label for a language code, for UI badges. Accepts a plain
 * `string` (not `LanguageCode`) because the value typically comes from the
 * DB `language` column, which may hold legacy / unknown codes — those fall
 * through to the `default` branch and are upper-cased.
 */
export function languageLabel(code: string): string {
  switch (code) {
    case "ar":
      return "العربية";
    case "zh":
      return "中文";
    case "ja":
      return "日本語";
    case "ko":
      return "한국어";
    case "ru":
      return "Русский";
    case "hi":
      return "हिन्दी";
    case "el":
      return "Ελληνικά";
    case "he":
      return "עברית";
    case "th":
      return "ไทย";
    case "en":
      return "English";
    default:
      return code.toUpperCase();
  }
}
