/**
 * src/lib/i18n-store.ts
 * ---------------------------------------------------------------------------
 * Tiny locale store for the bottle app. Supports English + Arabic with full
 * RTL. The chosen locale:
 *   - drives the <html dir> + <html lang> attributes (applied in I18nGate)
 *   - swaps the UI copy via the `t()` dictionary below
 *   - is persisted to localStorage so a returning visitor keeps their shore
 *
 * Kept deliberately small (no full i18n framework) — the app has one route
 * and a bounded set of user-facing strings. RTL correctness comes from the
 * dir attribute + logical Tailwind properties (ps/pe/ms/me) already used
 * across the components.
 * -------------------------------------------------------------------------
 */

import { create } from "zustand";
import { useCallback } from "react";

export type Locale = "en" | "ar";

/** Flat dictionary of every locale-aware UI string used by the bottle app. */
const STRINGS = {
  en: {
    "app.title": "Message in a Bottle",
    "app.subtitle": "Cast an anonymous note into the sea. Someone will find it.",
    "app.meta": "Anonymous by design · server-side moderation · crisis resources verified for Egypt & beyond.",
    "app.crisis": "If you're in crisis, reach out — you deserve support.",
    // --- Live "Bottles exchanged today" counter (header) -------------------
    // Full phrase used for the pill's aria-label (number interpolated by the
    // component). The short `today` caption sits beside the number; `live`
    // labels the pulsing dot that signals real-time updates.
    "header.exchanged_today.label": "Bottles exchanged today",
    "header.exchanged_today.today": "today",
    "header.exchanged_today.live": "live",
    "nav.write": "Write",
    "nav.sea": "The Sea",
    "nav.admin": "Admin review",
    "nav.gems": "Wall of Gems",
    "nav.lang": "العربية",
    "nav.lang.aria": "Switch to Arabic",
    "banner.title": "Cast a bottle to receive one.",
    "banner.body":
      "Every throw is a trade: your message is stored, and the server hands back someone else's — atomically, in a single transaction. You can't receive without giving first. Submissions run two gates: a PII filter and a moderation classifier. When the pool is small, curated starter bottles keep the sea from being empty.",
    "write.kicker": "A quiet space",
    "write.heading": "Write something honest",
    "write.subhead":
      "No names, no replies. Just you and the water. If someone finds this bottle, what would you want them to read?",
    "write.tone": "Pick a tone",
    "write.tone.optional": "optional",
    "write.placeholder":
      "Write something honest. If someone finds it, what would you want them to read?",
    "write.hint.empty": "At least {min} characters, up to {max}.",
    "write.hint.short": "{n} more character to go…",
    "write.hint.short_plural": "{n} more characters to go…",
    "write.hint.ok": "Looks good. Cast it when you're ready.",
    "write.cta.idle": "Throw your bottle",
    "write.cta.submitting": "Sealing your bottle…",
    "write.cta.throwing": "Casting…",
    "reveal.kicker": "A bottle drifted back to you",
    "reveal.unrolling": "Unrolling the note…",
    "reveal.dismiss": "Dismiss",
    "reveal.found": "Found {n}×",
    "drift.title": "Your bottle is drifting out to sea",
    "drift.body": "It passed moderation and is now floating for someone to find.",
    "drift.reviewTitle": "Awaiting moderator approval",
    "sea.heading": "Bottles in the sea",
    "sea.refresh": "Refresh",
    "sea.empty": "The sea is calm. Cast the first bottle.",
    "sea.loading": "Gathering bottles…",
    "reveal.react.label": "Leave a small sign",
    "reveal.react.heart": "Heart",
    "reveal.react.smile": "Smile",
    "reveal.react.feel_you": "I feel you",
    "reveal.react.sent": "Sent",
    "reveal.react.too_soon": "A moment — the sea needs a breath.",
    "reveal.reply.label": "Leave a quick word",
    "reveal.reply.placeholder": "One kind word…",
    "reveal.reply.hint": "Up to 30 characters · no links or numbers",
    "reveal.reply.cta": "Send",
    "reveal.reply.sending": "Sending…",
    "reveal.reply.thanks": "Your word is drifting to them.",
    "reveal.reply.empty": "Write a word first.",
    "reveal.reply.too_long": "Keep it to 30 characters.",
    "reveal.reply.too_soon": "A moment — the sea needs a breath.",
    "save.title": "Save your bottle",
    "save.body": "Keep this private link to see who your bottle reached. No login — anyone with the link can see its reactions.",
    "save.copy": "Copy my link",
    "save.copied": "Copied!",
    "save.note": "Keep this link private — it's the only way back to your bottle.",
    "mybottle.kicker": "A private reading room",
    "mybottle.title": "Your bottle",
    "mybottle.intro": "Here's what drifted back to your bottle.",
    "mybottle.reactions": "Reactions",
    "mybottle.replies": "Quick words",
    "mybottle.replies.empty": "No quick words yet — your bottle is still drifting.",
    "mybottle.back": "Back to the sea",
    "mybottle.notfound": "This bottle link isn't valid or has drifted away.",
    "mybottle.error": "We couldn't reach your bottle just now — try again in a moment.",
    "mybottle.retry": "Try again",
    "mybottle.heart": "Hearts",
    "mybottle.smile": "Smiles",
    // --- Gentle rate-limit / anti-spam messages -----------------------------
    // Friendly, never raw HTTP errors. 🌊 keeps the oceanic voice.
    "error.rate_limited.throw.title": "That's enough bottles for now",
    "error.rate_limited.throw.body":
      "You've used all your bottles — a new one drifts back every 30 minutes 🌊",
    "error.rate_limited.reaction":
      "That's a lot of warmth for one hour — let the sea settle a little 🌊",
    "error.captcha.title": "One more try?",
    "error.captcha.body":
      "We couldn't quite tell you're human. Give it another cast?",
    "error.duplicate.title": "You just sent that",
    "error.duplicate.body":
      "You just sent something very like that — let a different thought drift out.",
    "write.captcha.checking": "Checking the tide…",
    // --- Daily bottle cap indicator (feature 5) ---------------------------
    // Makes the rate limit feel like a feature, not a restriction.
    // "n of m bottles left" — encourages thoughtful writing.
    "quota.label": "Bottles left",
    "quota.remaining": "{left} of {limit} bottles left",
    "quota.last": "This is your last bottle for now — make it count.",
    "quota.none": "That's all for now — a new one drifts back every 30 min 🌊",
    "quota.refresh": "One bottle refills every 30 minutes",
    "quota.next": "Next bottle in ~{min} min",
    // --- Time Capsule (feature 2) -----------------------------------------
    "capsule.label": "When should it drift in?",
    "capsule.optional": "optional",
    "capsule.now": "Now",
    "capsule.now.hint": "Enter the shared pool immediately",
    "capsule.24h": "In 24 hours",
    "capsule.24h.hint": "A day from now",
    "capsule.7d": "In 7 days",
    "capsule.7d.hint": "A week from now",
    "capsule.1y": "In 1 year",
    "capsule.1y.hint": "A message to the future",
    "capsule.note": "Your bottle is sealed and stored now, but waits out of the shared pool until its time comes.",
    // --- Language preference picker (feature 4) ---------------------------
    "langpref.label": "Show me bottles in",
    "langpref.any": "Any language",
    "langpref.ar": "Arabic",
    "langpref.note": "We'll try to match your preference; the sea relaxes this if nothing fits.",
    // --- Wall of Gems (feature 1) -----------------------------------------
    "gems.heading": "Wall of Gems",
    "gems.kicker": "The brightest bottles this week",
    "gems.intro": "The twenty most-reacted messages from the last seven days. Fully anonymous — refreshed daily.",
    "gems.empty": "The gems are still gathering. Check back soon.",
    "gems.refreshed": "Refreshed daily",
    "gems.total_reactions": "{n} reactions",
    // --- Impact indicator (feature 3) -------------------------------------
    // Poetic aggregate shown to the author via their private token link.
    // Never reveals identity — only the total warmth their bottle received.
    // Uses the singular/_plural key pattern (see pluralKey()) like the rest
    // of the app, since the t() helper does simple {name} interpolation only.
    "impact.title": "Your bottle's impact",
    "impact.empty": "Your bottle is still drifting — no signs of life yet.",
    "impact.some": "Your bottle has been found.",
    "impact.heart": "Hearts",
    "impact.smile": "Smiles",
    "impact.poetic.heart": "touched {n} heart",
    "impact.poetic.heart_plural": "touched {n} hearts",
    "impact.poetic.smile": "made someone smile {n} time",
    "impact.poetic.smile_plural": "made someone smile {n} times",
    "impact.poetic.feel_you": "{n} person felt you",
    "impact.poetic.feel_you_plural": "{n} people felt you",
    "impact.and": "and",
    // --- Admin login (gated moderation dashboard) --------------------------
    "admin.login.title": "Admin access",
    "admin.login.body": "Enter the admin token to open the moderation queue.",
    "admin.login.placeholder": "Admin token",
    "admin.login.cta": "Unlock",
    "admin.login.submitting": "Unlocking…",
    "admin.login.error": "Invalid token. Try again.",
    "admin.login.disabled": "Admin access is not configured on this deployment.",
    "admin.logout": "Sign out",
  },
  ar: {
    "app.title": "رسالة في زجاجة",
    "app.subtitle": "أرسل رسالة مجهولة إلى البحر. سيجدها أحدهم.",
    "app.meta": "مجهول الهوية · إشراف من جانف الخادم · موارد الأزمات معتمدة لمصر وما بعدها.",
    "app.crisis": "إن كنت في أزمة، اطلب المساعدة — تستحق الدعم.",
    // --- عداد «زجاجات بُدلت اليوم» المباشر في الترويسة -----------------------
    "header.exchanged_today.label": "زجاجات بُدلت اليوم",
    "header.exchanged_today.today": "اليوم",
    "header.exchanged_today.live": "مباشر",
    "nav.write": "اكتب",
    "nav.sea": "البحر",
    "nav.admin": "مراجعة المشرف",
    "nav.gems": "جدار الجواهر",
    "nav.lang": "English",
    "nav.lang.aria": "التبديل إلى الإنجليزية",
    "banner.title": "ألقِ زجاجة لتستقبل واحدة.",
    "banner.body":
      "كل رمية مقايضة: تُخزَّن رسالتك، ويعيد الخادم رسالة شخص آخر — في معاملة واحدة. لا يمكنك الاستقبال دون العطاء أولًا. تمر الرسائل ببوابتين: فلتر للمعلومات الشخصية ومصنّف إشراف. وعندما يكون البحر صغيرًا، تحتفظ زجاجات بادئة منتقاة بألا يكون البحر فارغًا.",
    "write.kicker": "مساحة هادئة",
    "write.heading": "اكتب شيئًا صادقًا",
    "write.subhead":
      "بلا أسماء ولا ردود. أنت والماء فحسب. إن وجد أحدهم هذه الزجاجة، فماذا تود أن يقرأ؟",
    "write.tone": "اختر نبرة",
    "write.tone.optional": "اختياري",
    "write.placeholder":
      "اكتب شيئًا صادقًا. إن وجدها أحدهم، فماذا تود أن يقرأ؟",
    "write.hint.empty": "على الأقل {min} حرفًا، حتى {max}.",
    "write.hint.short": "حرف واحد آخر…",
    "write.hint.short_plural": "{n} أحرف أخرى…",
    "write.hint.ok": "يبدو جيدًا. ألقِها حين تكون مستعدًا.",
    "write.cta.idle": "ألقِ زجاجتك",
    "write.cta.submitting": "تُختم زجاجتك…",
    "write.cta.throwing": "تُلقى…",
    "reveal.kicker": "عادت إليك زجاجة",
    "reveal.unrolling": "يُفتح الرق…",
    "reveal.dismiss": "إغلاق",
    "reveal.found": "وُجدت {n}×",
    "drift.title": "زجاجتك تنجرف إلى البحر",
    "drift.body": "اجتازت الإشراف وهي الآن طافية ليجدها أحدهم.",
    "drift.reviewTitle": "بانتظار موافقة المشرف",
    "sea.heading": "زجاجات في البحر",
    "sea.refresh": "تحديث",
    "sea.empty": "البحر هادئ. ألقِ أول زجاجة.",
    "sea.loading": "تُجمع الزجاجات…",
    "reveal.react.label": "اترك إشارة صغيرة",
    "reveal.react.heart": "قلب",
    "reveal.react.smile": "ابتسامة",
    "reveal.react.feel_you": "أشعر بك",
    "reveal.react.sent": "تم",
    "reveal.react.too_soon": "لحظة — يحتاج البحر نفَسًا.",
    "reveal.reply.label": "اترك كلمة سريعة",
    "reveal.reply.placeholder": "كلمة طيبة…",
    "reveal.reply.hint": "حتى 30 حرفًا · بلا روابط أو أرقام",
    "reveal.reply.cta": "أرسل",
    "reveal.reply.sending": "يُرسل…",
    "reveal.reply.thanks": "كلمتك تنجرف إليهم.",
    "reveal.reply.empty": "اكتب كلمة أولًا.",
    "reveal.reply.too_long": "اقتصر على 30 حرفًا.",
    "reveal.reply.too_soon": "لحظة — يحتاج البحر نفَسًا.",
    "save.title": "احفظ زجاجتك",
    "save.body": "احتفظ بهذا الرابط الخاص لترى من وصلت إليه زجاجتك. بلا تسجيل دخول — كل من يملك الرابط يرى تفاعلاتها.",
    "save.copy": "انسخ رابطي",
    "save.copied": "تم النسخ!",
    "save.note": "احتفظ بهذا الرابط سريًا — هو طريقك الوحيد للعودة إلى زجاجتك.",
    "mybottle.kicker": "غرفة قراءة خاصة",
    "mybottle.title": "زجاجتك",
    "mybottle.intro": "إليك ما عاد إلى زجاجتك.",
    "mybottle.reactions": "التفاعلات",
    "mybottle.replies": "كلمات سريعة",
    "mybottle.replies.empty": "لا كلمات بعد — زجاجتك لا تزال تنجرف.",
    "mybottle.back": "العودة إلى البحر",
    "mybottle.notfound": "رابط الزجاجة غير صالح أو قد انجرف بعيدًا.",
    "mybottle.error": "تعذّر الوصول إلى زجاجتك الآن — حاول مجددًا بعد لحظة.",
    "mybottle.retry": "حاول مجددًا",
    "mybottle.heart": "قلوب",
    "mybottle.smile": "ابتسامات",
    // --- رسائل حدّ المعدّل / مكافحة الإزعاج بلطف ----------------------------
    "error.rate_limited.throw.title": "يكفي زجاجات للآن",
    "error.rate_limited.throw.body":
      "لقد استخدمت كل زجاجاتك — زجاجة جديدة تنجرف كل 30 دقيقة 🌊",
    "error.rate_limited.reaction":
      "هذا الكثير من الدفء في ساعة واحدة — دع البحر يهدأ قليلًا 🌊",
    "error.captcha.title": "محاولة أخرى؟",
    "error.captcha.body":
      "لم نتأكد تمامًا أنك بشري. جرّب رمية أخرى؟",
    "error.duplicate.title": "لقد أرسلت هذا للتو",
    "error.duplicate.body":
      "لقد أرسلت للتو شيئًا يشبه هذا كثيرًا — دع فكرة مختلفة تنجرف.",
    "write.captcha.checking": "نتفحّد الموج…",
    // --- مؤشر سقف الزجاجات اليومي (ميزة 5) ----------------------------------
    "quota.label": "زجاجات متبقية",
    "quota.remaining": "بقيت {left} من {limit} زجاجات",
    "quota.last": "هذه آخر زجاجة للآن — اجعلها مميزة.",
    "quota.none": "هذا كل شيء للآن — زجاجة جديدة تنجرف كل 30 دقيقة 🌊",
    "quota.refresh": "تتجدد زجاجة كل 30 دقيقة",
    "quota.next": "زجاجة جديدة خلال ~{min} دقيقة",
    // --- كبسولة الزمن (ميزة 2) ----------------------------------------------
    "capsule.label": "متى تنجرف؟",
    "capsule.optional": "اختياري",
    "capsule.now": "الآن",
    "capsule.now.hint": "ادخل البركة المشتركة فورًا",
    "capsule.24h": "خلال 24 ساعة",
    "capsule.24h.hint": "بعد يوم من الآن",
    "capsule.7d": "خلال 7 أيام",
    "capsule.7d.hint": "بعد أسبوع من الآن",
    "capsule.1y": "خلال سنة",
    "capsule.1y.hint": "رسالة إلى المستقبل",
    "capsule.note": "زجاجتك مُختمة ومُخزَّنة الآن، لكنها تنتظر خارج البركة المشتركة حتى يحين وقتها.",
    // --- أداة اختيار اللغة (ميزة 4) -----------------------------------------
    "langpref.label": "أرني زجاجات بـ",
    "langpref.any": "أي لغة",
    "langpref.ar": "العربية",
    "langpref.note": "سنحاول مطابقة تفضيلك؛ يُرخّص البحر هذا إن لم يجد ما يناسب.",
    // --- جدار الجواهر (ميزة 1) ----------------------------------------------
    "gems.heading": "جدار الجواهر",
    "gems.kicker": "ألمع الزجاجات هذا الأسبوع",
    "gems.intro": "العشرون رسالة الأكثر تفاعلًا خلال الأيام السبعة الماضية. مجهولة تمامًا — تُحدَّث يوميًا.",
    "gems.empty": "الجواهر لا تزال تتجمع. عُد قريبًا.",
    "gems.refreshed": "تُحدَّث يوميًا",
    "gems.total_reactions": "{n} تفاعل",
    // --- مؤشر الأثر (ميزة 3) ------------------------------------------------
    "impact.title": "أثر زجاجتك",
    "impact.empty": "زجاجتك لا تزال تنجرف — لا إشارات حياة بعد.",
    "impact.some": "لقد وُجدت زجاجتك.",
    "impact.heart": "قلوب",
    "impact.smile": "ابتسامات",
    "impact.poetic.heart": "لمست {n} قلب",
    "impact.poetic.heart_plural": "لمست {n} قلوب",
    "impact.poetic.smile": "أضحكت أحدًا {n} مرة",
    "impact.poetic.smile_plural": "أضحكت أحدًا {n} مرات",
    "impact.poetic.feel_you": "شعر بك {n} شخص",
    "impact.poetic.feel_you_plural": "شعر بك {n} أشخاص",
    "impact.and": "و",
    // --- تسجيل دخول المشرف (لوحة المراجعة المحمية) -------------------------
    "admin.login.title": "دخول المشرف",
    "admin.login.body": "أدخل رمز المشرف لفتح قائمة المراجعة.",
    "admin.login.placeholder": "رمز المشرف",
    "admin.login.cta": "فتح",
    "admin.login.submitting": "جارٍ الفتح…",
    "admin.login.error": "رمز غير صحيح. حاول مرة أخرى.",
    "admin.login.disabled": "دخول المشرف غير مُهيّأ على هذا النشر.",
    "admin.logout": "خروج",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

interface I18nState {
  locale: Locale;
  dir: "ltr" | "rtl";
  /** Apply a locale (sets dir + persists). */
  setLocale: (l: Locale) => void;
  /** Toggle between the two locales. */
  toggle: () => void;
}

const STORAGE_KEY = "bottle.locale";

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: "en",
  dir: "ltr",
  setLocale: (l) =>
    set({
      locale: l,
      dir: l === "ar" ? "rtl" : "ltr",
    }),
  toggle: () => {
    const next = get().locale === "ar" ? "en" : "ar";
    get().setLocale(next);
  },
}));

/**
 * Translate a key for the current locale. Interpolates {name} placeholders.
 * Falls back to English (then the raw key) so a missing translation never
 * renders empty.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const locale = useI18n.getState().locale;
  const dict = STRINGS[locale] ?? STRINGS.en;
  let s: string = (dict as Record<string, string>)[key] ?? (STRINGS.en as Record<string, string>)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

/** Initialise the store from storage on the client. Safe to call repeatedly. */
export function initLocaleFromStorage() {
  if (typeof window === "undefined") return;
  const stored = readStoredLocale();
  useI18n.getState().setLocale(stored);
}

/** Persist + reflect the locale onto <html> whenever it changes. */
export function applyLocaleToDocument(locale: Locale) {
  if (typeof document === "undefined") return;
  const dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Pluralisation helper: pick singular vs plural form based on count. */
export function pluralKey(key: StringKey, count: number): StringKey {
  return count === 1 ? key : (`${key}_plural` as StringKey);
}

/**
 * Reactive translator. Components call `const t = useT()` and re-render when
 * the locale changes. (The bare `t()` export reads the store without
 * subscribing, so it's fine for non-React contexts but won't trigger updates.)
 */
export function useT() {
  const locale = useI18n((s) => s.locale);
  return useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      const dict = STRINGS[locale] ?? STRINGS.en;
      let s: string =
        (dict as Record<string, string>)[key] ??
        (STRINGS.en as Record<string, string>)[key] ??
        key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return s;
    },
    [locale],
  );
}
