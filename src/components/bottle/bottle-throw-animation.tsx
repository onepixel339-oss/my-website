"use client";

/**
 * BottleThrowAnimation
 * ---------------------------------------------------------------------------
 * A short, decorative overlay that plays when a bottle is successfully cast.
 * An amber glass bottle launches from the composer, arcs up and to the right
 * while spinning and shrinking, then fades into the distance — as if drifting
 * out to sea. A soft ripple rings out at the launch point.
 *
 * This is purely visual (aria-hidden). The substantive success feedback
 * (banner + toast + feed update) is handled by the composer, so the
 * animation is safe to skip for reduced-motion users.
 * ---------------------------------------------------------------------------
 */

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

function BottleSVG() {
  return (
    <svg
      width="64"
      height="88"
      viewBox="0 0 64 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="bottleGlass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      {/* cork */}
      <rect x="27" y="3" width="10" height="9" rx="1.5" fill="#92400e" />
      <rect x="27" y="3" width="10" height="3" rx="1.5" fill="#78350f" />
      {/* neck */}
      <rect x="28" y="11" width="8" height="13" fill="url(#bottleGlass)" />
      {/* shoulder + body */}
      <path
        d="M24 24 L40 24 Q44 26 44 32 L44 78 Q44 85 37 85 L27 85 Q20 85 20 78 L20 32 Q20 26 24 24 Z"
        fill="url(#bottleGlass)"
      />
      {/* glass highlight */}
      <path
        d="M24 28 Q23 28 23 30 L23 74 Q23 76 24 76 L25 76 L25 28 Z"
        fill="#fde68a"
        opacity="0.55"
      />
      {/* rolled note inside */}
      <rect x="27" y="48" width="10" height="26" rx="2" fill="#fffbeb" opacity="0.92" />
      <rect x="27" y="48" width="10" height="4" rx="2" fill="#fcd34d" opacity="0.6" />
      {/* note lines */}
      <line x1="30" y1="57" x2="34" y2="57" stroke="#b45309" strokeWidth="1" opacity="0.45" />
      <line x1="30" y1="61" x2="34" y2="61" stroke="#b45309" strokeWidth="1" opacity="0.45" />
      <line x1="30" y1="65" x2="33" y2="65" stroke="#b45309" strokeWidth="1" opacity="0.45" />
    </svg>
  );
}

export function BottleThrowAnimation({ onComplete }: { onComplete: () => void }) {
  const reduced = useReducedMotion();

  // Safety net: if onAnimationComplete doesn't fire (e.g. the component is
  // unmounted mid-flight), still resolve after the expected duration so the
  // composer never gets stuck in the "throwing" state.
  useEffect(() => {
    const t = setTimeout(onComplete, reduced ? 200 : 2200);
    return () => clearTimeout(t);
  }, [onComplete, reduced]);

  // Reduced motion: skip the arc entirely — just resolve immediately so the
  // success banner shows. The overlay still mounts for one tick.
  if (reduced) {
    return null;
  }

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Launch ripple — a soft teal ring expanding where the bottle meets
          the water (the "plop" of a cast bottle breaking the surface). */}
      <motion.div
        className="absolute rounded-full border-2 border-teal-300/70"
        style={{
          left: "calc(50% - 48px)",
          bottom: "13%",
          width: 96,
          height: 96,
        }}
        initial={{ scale: 0.15, opacity: 0.6 }}
        animate={{ scale: [0.15, 1.6], opacity: [0.6, 0] }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      {/* A second, slower outer ripple for a richer water feel. */}
      <motion.div
        className="absolute rounded-full border border-teal-200/50"
        style={{
          left: "calc(50% - 64px)",
          bottom: "12%",
          width: 128,
          height: 128,
        }}
        initial={{ scale: 0.1, opacity: 0.4 }}
        animate={{ scale: [0.1, 1.9], opacity: [0.4, 0] }}
        transition={{ duration: 1.3, delay: 0.12, ease: "easeOut" }}
      />

      {/* The bottle — arcs up and to the right, spinning and receding.
          The opacity fades to 0 in the last keyframe so the handoff to the
          drift section feels like the bottle dissolving into the distance,
          not a hard cut when the overlay unmounts. */}
      <motion.div
        className="absolute"
        style={{ left: "calc(50% - 32px)", bottom: "16%", width: 64, height: 88 }}
        initial={{ x: 0, y: 0, rotate: -18, scale: 0.9, opacity: 0 }}
        animate={{
          x: [0, 70, 250, 360],
          y: [0, -250, -310, -140],
          rotate: [-18, 190, 470, 720],
          scale: [0.9, 1, 0.5, 0.14],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1.7,
          ease: "easeInOut",
          times: [0, 0.16, 0.7, 1],
        }}
        onAnimationComplete={onComplete}
      >
        <BottleSVG />
      </motion.div>

      {/* A couple of trailing sparkle droplets for delight — warm sand motes
          that follow the bottle's arc. These reinforce the direction of
          travel so the eye follows the bottle out to sea. */}
      <motion.span
        className="absolute block size-1.5 rounded-full bg-amber-200"
        style={{ left: "calc(50% - 4px)", bottom: "20%" }}
        initial={{ opacity: 0, y: 0, x: 0 }}
        animate={{ opacity: [0, 1, 0], x: [0, 40, 90], y: [0, -120, -90] }}
        transition={{ duration: 1.1, delay: 0.25, ease: "easeOut" }}
      />
      <motion.span
        className="absolute block size-1 rounded-full bg-teal-100"
        style={{ left: "calc(50% + 8px)", bottom: "19%" }}
        initial={{ opacity: 0, y: 0, x: 0 }}
        animate={{ opacity: [0, 1, 0], x: [0, 55, 130], y: [0, -160, -130] }}
        transition={{ duration: 1.2, delay: 0.32, ease: "easeOut" }}
      />
    </motion.div>
  );
}
