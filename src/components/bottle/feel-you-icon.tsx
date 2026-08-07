/**
 * FeelYouIcon — "I feel you"
 * ---------------------------------------------------------------------------
 * A small, calm empathy mark for the bottle app's reaction row. Two gentle
 * horizontal waves that start apart and curve toward a shared point in the
 * middle — two sine resonances slipping into alignment. Reads as both
 * "I feel you" (your wave and my wave meeting) and the dusk-over-water theme.
 *
 * Pure SVG, inherits text color via `currentColor` so it tints with the
 * surrounding teal-on-glass palette. No "use client" — it's a stateless
 * presentational glyph safe to render anywhere.
 * -------------------------------------------------------------------------
 */

export function FeelYouIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/*
        Two resonating waves. The upper wave dips down from the left and right
        shoulders to touch the centre; the lower wave rises up to meet it. They
        share the single point (12, 12) — the moment of "I feel you".
      */}
      <path d="M 2 8 Q 5 5.5 8 8 Q 10 10.5 12 12 Q 14 10.5 16 8 Q 19 5.5 22 8" />
      <path d="M 2 16 Q 5 18.5 8 16 Q 10 13.5 12 12 Q 14 13.5 16 16 Q 19 18.5 22 16" />
    </svg>
  );
}
