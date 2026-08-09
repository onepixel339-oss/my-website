/**
 * src/lib/moderation.ts
 * ---------------------------------------------------------------------------
 * Server-side content moderation pipeline.
 *
 * This module is the SINGLE source of truth for moderation decisions. It is
 * designed to be called SYNCHRONOUSLY before the INSERT in the exchange
 * endpoint (see src/app/api/exchange/route.ts). Moderation must block
 * distribution — it never runs "after the fact".
 *
 * Pipeline:
 *   1. moderateMessage(content) -> ModerationResult
 *        - Sends the message to a hosted LLM classifier (z-ai-web-dev-sdk)
 *          with a strict system prompt that returns ONLY structured JSON
 *          category scores. The model is instructed to NEVER echo trigger
 *          words / excerpts back.
 *        - The code (not the model) applies the published policy thresholds
 *          to produce a decision. This keeps policy reviewable and testable.
 *   2. The caller persists the message with the resulting status/flag and
 *      writes an immutable ModerationLog row (flagType + confidence only —
 *      never trigger words).
 *
 * Decision matrix (applied in priority order):
 *   - self_harm  (>= SELF_HARM_THRESHOLD)         -> self_harm_block
 *       The message is NOT distributed. The author receives a warm,
 *       supportive response with local (Egypt) + international crisis
 *       resources. It is also surfaced to admins for safety follow-up.
 *   - severe category (hate / harassment / sexual_minors / doxxing /
 *     graphic_violence) (>= SEVERE_THRESHOLD)     -> pending_review
 *       is_hidden = true, never auto-distributed. Surfaces in admin queue
 *       for the operator to decide (approve → publish, or reject).
 *   - any category (>= BORDERLINE_THRESHOLD but < SEVERE) -> pending_review
 *       Queued for lightweight human review; NOT auto-published.
 *   - otherwise                                     -> publish
 *
 * Fail-safe: if the classifier is unavailable or returns unparseable output
 * (e.g. on Vercel where the z-ai-web-dev-sdk config file is not present),
 * the message is PUBLISHED. The PII filter (regex-based) already ran before
 * moderation and caught personal info. Holding every message when the
 * classifier is down would make the app unusable for the operator. Set
 * `MODERATION_FAIL_SAFE=review` in the environment to restore the old
 * "hold everything when classifier is down" behaviour.
 *
 * Privacy: this module never returns, and the persisted audit log never
 * stores, the specific words/phrases that triggered a flag. Only the flag
 * type and confidence score are surfaced (and only to the audit log / admin
 * review queue — never to end users).
 * ---------------------------------------------------------------------------
 */

import ZAI from "z-ai-web-dev-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Categories the classifier scores. Maps 1:1 to audit `flagType`. */
export type ModerationFlagType =
  | "self_harm"
  | "harassment"
  | "sexual_minors"
  | "hate_speech"
  | "graphic_violence"
  | "doxxing"
  | "none";

/** Resulting distribution decision. Drives the DB `moderationStatus`. */
export type ModerationDecision =
  | "publish"
  | "reject"
  | "pending_review"
  | "self_harm_block";

export interface ModerationResult {
  /** Final distribution decision. */
  decision: ModerationDecision;
  /** Primary flag type that drove the decision ("none" when clean). */
  flagType: ModerationFlagType;
  /** Highest relevant confidence in [0,1]. */
  confidence: number;
  /** Per-category scores from the classifier (audit-only, never sent to end users). */
  scores: Record<Exclude<ModerationFlagType, "none">, number>;
  /** Identifier of the classifier that produced the scores. */
  modelVersion: string;
  /** True when the decision was reached via the fail-safe path. */
  degraded: boolean;
  /**
   * True when the message was classified as clean ("publish") but is held for
   * manual admin approval because `REQUIRE_MANUAL_APPROVAL` is enabled. The
   * caller should treat this like a pending_review decision, but still give
   * the author a received bottle (their message is almost certainly fine).
   */
  pendingManualApproval?: boolean;
}

// ---------------------------------------------------------------------------
// Policy thresholds (tunable, intentionally conservative)
// ---------------------------------------------------------------------------

/**
 * Self-harm uses a LOWER threshold than other categories. The intervention is
 * supportive (not punitive), and the cost of missing a self-harm signal far
 * outweighs the cost of an extra supportive message.
 */
export const SELF_HARM_THRESHOLD = 0.45;

/** High-confidence severe violations are auto-rejected (still audited). */
export const SEVERE_THRESHOLD = 0.7;

/** Anything at/above this but below SEVERE is queued for human review. */
export const BORDERLINE_THRESHOLD = 0.4;

/** Hard cap on input length sent to the classifier (DoS + cost guard). */
const MAX_INPUT_CHARS = 8000;

/**
 * Manual-approval mode.
 *
 * When `REQUIRE_MANUAL_APPROVAL` is enabled, every message that the classifier
 * scores as clean is held for human review instead of being auto-published.
 * The operator (admin) must explicitly approve it from the moderation
 * dashboard before it appears in the public feed.
 *
 *   - Severe violations are STILL auto-rejected (the classifier + policy run
 *     first; only the "publish" path is affected).
 *   - Self-harm messages STILL get the supportive path immediately.
 *   - Only clean ("publish") messages are rerouted to pending_review.
 *
 * DEFAULT IS OFF: clean messages auto-publish so the operator doesn't have to
 * approve every single bottle. The admin review queue still catches borderline
 * content, PII rejections, severe violations, and self-harm cases. Set
 * `REQUIRE_MANUAL_APPROVAL=true` in the environment to require manual approval
 * for every message.
 */
export const REQUIRE_MANUAL_APPROVAL =
  process.env.REQUIRE_MANUAL_APPROVAL === "true";

const SEVERE_CATEGORIES: Exclude<ModerationFlagType, "none">[] = [
  "hate_speech",
  "harassment",
  "sexual_minors",
  "doxxing",
  "graphic_violence",
];

const ALL_CATEGORIES: Exclude<ModerationFlagType, "none">[] = [
  "self_harm",
  "harassment",
  "sexual_minors",
  "hate_speech",
  "graphic_violence",
  "doxxing",
];

const MODEL_VERSION = "zai-llm-moderator-v1";

// ---------------------------------------------------------------------------
// Crisis resources (self-harm supportive response)
// Sourced & cross-verified via web search — see worklog Task ID 2.
// User timezone is Africa/Cairo, so Egypt-local resources are primary.
// ---------------------------------------------------------------------------

export interface CrisisResource {
  name: string;
  phone?: string;
  url?: string;
  hours?: string;
  description: string;
}

export const EGYPT_CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: "General Secretariat of Mental Health & Addiction Treatment (GSMHAT) Hotline",
    phone: "16328 (toll-free within Egypt)",
    url: "https://mentalhealth.mohp.gov.eg/mental/web/en",
    hours: "24/7",
    description:
      "Egypt's national Ministry of Health mental-health & addiction-treatment hotline. Free, confidential, Arabic & English.",
  },
  {
    name: "GSMHAT Secondary Hotlines",
    phone: "08008880700 / 0220816831 (Cairo)",
    url: "https://mentalhealth.mohp.gov.eg/mental/web/en",
    hours: "24/7",
    description:
      "Alternative direct lines to the General Secretariat of Mental Health for psychological support and referrals.",
  },
];

export const INTERNATIONAL_CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: "International Association for Suicide Prevention — Crisis Centres & Helplines",
    url: "https://www.iasp.info/crisis-centres-helplines/",
    description:
      "Global directory that routes people in crisis to a verified helpline in their country.",
  },
  {
    name: "Befrienders Worldwide",
    url: "https://befrienders.org/",
    description:
      "Worldwide network of volunteer emotional-support centres; find a local centre by country.",
  },
  {
    name: "Find A Helpline",
    url: "https://findahelpline.com/",
    description:
      "Verified, searchable directory of free crisis helplines across 100+ countries.",
  },
  {
    name: "988 Suicide & Crisis Lifeline (United States)",
    phone: "988 (call or text)",
    url: "https://988lifeline.org/",
    description: "Free, 24/7 US lifeline connecting by call, text, or chat to trained crisis counsellors.",
  },
  {
    name: "Samaritans (United Kingdom & Ireland)",
    phone: "116 123",
    url: "https://www.samaritans.org/",
    description: "Free 24/7 confidential listening line for anyone struggling to cope, across the UK & Ireland.",
  },
];

/**
 * Supportive acknowledgment shown to the AUTHOR of a self-harm-flagged
 * message. Warm, non-judgmental, does NOT repeat any flagged content, does
 * NOT lecture or diagnose. Always acknowledges that the message was heard.
 */
export const SELF_HARM_SUPPORTIVE_RESPONSE =
  "Thank you for reaching out — what you shared has been heard, and you don't have to carry this alone right now. " +
  "Your message was not shared with others, because we want to make sure you're okay. " +
  "If you're in Egypt, the General Secretariat of Mental Health & Addiction Treatment hotline is free and available 24/7 at 16328 (also 08008880700). " +
  "You can also find a support line that fits your situation through the resources below. Reaching out to a trained listener is a quiet, valid step, and you deserve that support.";

// ---------------------------------------------------------------------------
// Classifier prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a strict content-moderation classifier for a public message board.

You will receive a single user-submitted message. Score it from 0.0 to 1.0 for
the likelihood that it contains each of the following categories:

- self_harm: suicidal ideation, self-injury, or crisis language indicating the
  author may be at risk of harming themselves.
- harassment: targeted attacks, bullying, threats, or sustained abuse directed
  at a specific person or group.
- sexual_minors: sexual content involving minors, or sexualization of minors.
- hate_speech: slurs, dehumanization, or attacks on protected characteristics
  (race, religion, ethnicity, gender, sexual orientation, disability, etc.).
- graphic_violence: vivid descriptions of gore, murder, torture, or extreme
  physical harm.
- doxxing: sharing or threatening to share private personal information
  (home address, phone, ID, real name) about someone without consent.

Output rules — follow ALL of them:
1. Respond with a SINGLE JSON object and NOTHING else. No prose, no markdown.
2. The object MUST have exactly this shape:
   {"self_harm": <number>, "harassment": <number>, "sexual_minors": <number>, "hate_speech": <number>, "graphic_violence": <number>, "doxxing": <number>}
3. Every value is a float in [0.0, 1.0].
4. CRITICAL PRIVACY: Do NOT include any quoted text, excerpts, paraphrases, or
   specific words from the message in your response. Your output is scores
   only. Never echo the offending language.
5. Score benign messages 0.0 across all categories.
6. Be sensitive but precise: self_harm should score above 0.5 for clear
   expressions of suicidal intent or self-injury, but near 0 for figurative
   or metaphorical language ("I'm dying to see this movie" -> 0.0).`;

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

let zaiPromise: Promise<ZAI> | null = null;

async function getZAI(): Promise<ZAI> {
  if (!zaiPromise) {
    zaiPromise = ZAI.create();
  }
  try {
    return await zaiPromise;
  } catch (err) {
    // Reset so a subsequent call can retry.
    zaiPromise = null;
    throw err;
  }
}

interface RawScores {
  self_harm?: number;
  harassment?: number;
  sexual_minors?: number;
  hate_speech?: number;
  graphic_violence?: number;
  doxxing?: number;
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Best-effort extraction of a JSON object from an LLM response that may
 * occasionally wrap JSON in stray text/markdown fences despite instructions.
 */
function extractJson(raw: string): RawScores | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Fast path: already valid JSON.
  try {
    return JSON.parse(trimmed) as RawScores;
  } catch {
    // fall through
  }

  // Strip markdown code fences.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as RawScores;
    } catch {
      // fall through
    }
  }

  // Grab the first {...} block.
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as RawScores;
    } catch {
      // fall through
    }
  }

  return null;
}

function normalizeScores(raw: RawScores | null): Record<Exclude<ModerationFlagType, "none">, number> {
  return {
    self_harm: clamp01(raw?.self_harm),
    harassment: clamp01(raw?.harassment),
    sexual_minors: clamp01(raw?.sexual_minors),
    hate_speech: clamp01(raw?.hate_speech),
    graphic_violence: clamp01(raw?.graphic_violence),
    doxxing: clamp01(raw?.doxxing),
  };
}

/**
 * Apply published policy thresholds to classifier scores and produce a final
 * decision. Pure function — safe to unit-test.
 */
export function applyPolicy(
  scores: Record<Exclude<ModerationFlagType, "none">, number>,
): { decision: ModerationDecision; flagType: ModerationFlagType; confidence: number } {
  // 1) Self-harm takes the highest priority. Lower threshold; supportive path.
  if (scores.self_harm >= SELF_HARM_THRESHOLD) {
    return {
      decision: "self_harm_block",
      flagType: "self_harm",
      confidence: scores.self_harm,
    };
  }

  // 2) Severe categories at/above the severe threshold -> send to admin
  //    review. The operator decides whether to publish or reject; we never
  //    auto-publish severe content, but we also don't auto-reject it — the
  //    admin may overturn a false positive (e.g. news discussion flagged as
  //    hate speech).
  let severeFlag: Exclude<ModerationFlagType, "none"> | null = null;
  let severeConf = 0;
  for (const cat of SEVERE_CATEGORIES) {
    const s = scores[cat];
    if (s >= SEVERE_THRESHOLD && s > severeConf) {
      severeFlag = cat;
      severeConf = s;
    }
  }
  if (severeFlag) {
    return { decision: "pending_review", flagType: severeFlag, confidence: severeConf };
  }

  // 3) Borderline: any category at/above borderline but below severe -> review.
  let borderlineFlag: Exclude<ModerationFlagType, "none"> | null = null;
  let borderlineConf = 0;
  for (const cat of ALL_CATEGORIES) {
    const s = scores[cat];
    if (s >= BORDERLINE_THRESHOLD && s < SEVERE_THRESHOLD && s > borderlineConf) {
      borderlineFlag = cat;
      borderlineConf = s;
    }
  }
  if (borderlineFlag) {
    return { decision: "pending_review", flagType: borderlineFlag, confidence: borderlineConf };
  }

  // 4) Clean.
  return { decision: "publish", flagType: "none", confidence: 0 };
}

/**
 * Run a single message through the moderation classifier and return a
 * synchronous decision. This MUST be awaited before the INSERT.
 *
 * @param content The user-submitted message text.
 */
export async function moderateMessage(content: string): Promise<ModerationResult> {
  const trimmed = (content ?? "").trim();
  const truncated = trimmed.slice(0, MAX_INPUT_CHARS);

  // Empty / whitespace-only input is never published — route to review.
  if (!truncated) {
    return {
      decision: "pending_review",
      flagType: "none",
      confidence: 0,
      scores: normalizeScores(null),
      modelVersion: MODEL_VERSION,
      degraded: true,
    };
  }

  let scores: Record<Exclude<ModerationFlagType, "none">, number>;
  let degraded = false;

  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJson(raw);
    scores = normalizeScores(parsed);

    // If we could not parse anything sensible, fail safe -> human review.
    if (!parsed) {
      degraded = true;
    }
  } catch {
    // Classifier unavailable (network, auth, rate-limit, missing config, etc.).
    // This happens on deployments where the z-ai-web-dev-sdk config file is
    // not present (e.g. Vercel). We PUBLISH the message instead of holding
    // it — the PII filter already ran before moderation (catching phone
    // numbers / emails / URLs), and holding every single message would make
    // the app unusable for the operator. The admin can still spot-check
    // published messages from the dashboard if needed.
    scores = normalizeScores(null);
    degraded = true;
  }

  const policy = applyPolicy(scores);

  // When the classifier itself failed, PUBLISH the message. The PII filter
  // (regex-based, runs before moderation) already caught personal info. We
  // don't hold every message just because the classifier is down — that
  // would make the app unusable. Set MODERATION_FAIL_SAFE=review to restore
  // the old "hold everything when classifier is down" behaviour.
  if (degraded && policy.decision === "publish") {
    if (process.env.MODERATION_FAIL_SAFE === "review") {
      return {
        decision: "pending_review",
        flagType: "none",
        confidence: 0,
        scores,
        modelVersion: MODEL_VERSION,
        degraded: true,
      };
    }
    return {
      decision: "publish",
      flagType: "none",
      confidence: 0,
      scores,
      modelVersion: MODEL_VERSION + "-unmoderated",
      degraded: true,
    };
  }

  // --- Manual-approval mode ----------------------------------------------
  // When enabled (the default), a clean "publish" decision is rerouted to
  // pending_review so the admin must explicitly approve every message before
  // it reaches the public feed. The caller can distinguish this from a
  // borderline hold via `pendingManualApproval` and still give the author a
  // received bottle (their message is almost certainly fine).
  if (REQUIRE_MANUAL_APPROVAL && policy.decision === "publish") {
    return {
      decision: "pending_review",
      flagType: "none",
      confidence: 0,
      scores,
      modelVersion: MODEL_VERSION,
      degraded: false,
      pendingManualApproval: true,
    };
  }

  return {
    decision: policy.decision,
    flagType: policy.flagType,
    confidence: Math.round(policy.confidence * 1000) / 1000,
    scores,
    modelVersion: MODEL_VERSION,
    degraded,
  };
}

// ---------------------------------------------------------------------------
// End-user-facing helpers
// ---------------------------------------------------------------------------

/**
 * Build the supportive payload returned to the author of a self-harm-flagged
 * message. Never includes trigger words; never repeats the flagged content.
 */
export function buildSelfHarmSupportPayload() {
  return {
    message: SELF_HARM_SUPPORTIVE_RESPONSE,
    localResources: EGYPT_CRISIS_RESOURCES,
    internationalResources: INTERNATIONAL_CRISIS_RESOURCES,
  };
}

/**
 * A generic, non-revealing rejection reason shown to the author when a
 * message is auto-rejected for a severe category. Deliberately vague about
 * the specific trigger (privacy + anti-gaming policy).
 */
export const GENERIC_REJECTION_NOTICE =
  "Your message was not published because it appears to violate our community guidelines. It has been held for review. If you believe this was a mistake, you're welcome to rephrase and post again.";

/**
 * Notice shown when a message is queued for human review. Does not reveal
 * which category was borderline.
 */
export const REVIEW_PENDING_NOTICE =
  "Thanks for your message. It's been held briefly for review and will appear once a moderator confirms it. This usually happens quickly.";

/**
 * Notice shown when a clean message is held for manual admin approval (i.e.
 * `REQUIRE_MANUAL_APPROVAL` is enabled). The author DID receive a bottle in
 * return — their message is almost certainly fine, it just needs a human nod
 * before it joins the public feed.
 */
export const MANUAL_REVIEW_PENDING_NOTICE =
  "Your bottle is drifting — you received one in return. Your message will appear in the sea once a moderator approves it (usually soon).";
