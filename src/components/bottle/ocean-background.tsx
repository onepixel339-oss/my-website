"use client";

/**
 * OceanBackground
 * ---------------------------------------------------------------------------
 * The calm, dusk-over-water atmosphere for the whole app. A fixed, full-
 * viewport layer painted behind everything:
 *
 *   - a vertical gradient: deep teal (deep water) → mid teal → warm sand
 *     (horizon glow) via the .ocean-surface utility
 *   - a soft radial "sun-at-the-horizon" bloom that gently breathes
 *   - two layered SVG wave strips at the bottom, drifting horizontally at
 *     different speeds for a slow parallax (CSS keyframes only — no JS loop,
 *     no canvas, no library)
 *   - a faint moonlight vignette at the top so header text stays legible
 *
 * Everything is aria-hidden and pointer-events-none so it never interferes
 * with interaction. prefers-reduced-motion freezes the drift (handled in
 * globals.css).
 * -------------------------------------------------------------------------
 */

export function OceanBackground() {
  return (
    <div
      className="ocean-surface pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      {/* Horizon bloom — a warm sand sun resting on the waterline. Colors
          come from CSS variables so the bloom adapts to theme: bright warm
          sand in daylight, dim moonlit brass at night. */}
      <div
        className="horizon-glow absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background:
            "radial-gradient(80% 100% at 50% 100%, var(--ocean-bloom) 0%, var(--ocean-bloom-mid) 30%, transparent 70%)",
        }}
      />

      {/* Moonlight vignette at the top — keeps header copy legible over the
          deepest water without darkening the whole scene. Theme-aware:
          a dark teal shade in light mode, a soft moonlit tint in dark. */}
      <div
        className="absolute inset-x-0 top-0 h-[40%]"
        style={{
          background:
            "linear-gradient(180deg, var(--ocean-vignette) 0%, transparent 100%)",
        }}
      />

      {/* Wave layers — two SVG strips, each 200% wide and tiled, drifting
          leftwards at different speeds for a gentle parallax. Colors are
          theme-aware: teal/amber in daylight, glowing teal/warm amber at
          night (kept subtle so they don't dominate the dark scene). */}
      <div className="absolute inset-x-0 bottom-0 h-[34%] overflow-hidden">
        <WaveLayer
          className="wave-layer-slow absolute bottom-0 left-0 h-full w-[200%] opacity-50"
          color="var(--wave-slow)"
          amplitude={14}
          fill
        />
        <WaveLayer
          className="wave-layer-fast absolute bottom-0 left-0 h-full w-[200%] opacity-70"
          color="var(--wave-fast)"
          amplitude={9}
          offset
        />
      </div>

      {/* A thin foam highlight along the waterline for definition. */}
      <div
        className="absolute inset-x-0 bottom-[33%] h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--wave-foam-line) 50%, transparent)",
        }}
      />
    </div>
  );
}

/**
 * A single repeating wave strip. The path is drawn across 0–50% of the
 * viewBox and then mirrored/tiled by repeating the SVG so a -50% translate
 * loops seamlessly (the .wave-layer-* keyframes translate to -50%).
 */
function WaveLayer({
  className,
  color,
  amplitude,
  fill = false,
  offset = false,
}: {
  className?: string;
  color: string;
  /** Vertical wave amplitude in viewBox units. */
  amplitude: number;
  /** Fill the area below the wave line with the same color. */
  fill?: boolean;
  /** Phase-shift the wave so the two layers don't move in lockstep. */
  offset?: boolean;
}) {
  // 0 → 1000 viewBox width; the wave spans the full width so that translating
  // the element by -50% reveals a seamless continuation (we duplicate the
  // path within the 200%-wide element via two <path> copies).
  const w = 1000;
  const baseY = offset ? 36 : 44;
  const path = wavePath(w, baseY, amplitude, offset ? 7 : 5);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} 80`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {fill ? (
        <>
          <path d={`${path} L ${w} 80 L 0 80 Z`} fill={color} />
          {/* Duplicate, shifted by the full width, so -50% translate loops. */}
          <path
            d={`${wavePath(w, baseY, amplitude, offset ? 7 : 5, w)} L ${w * 2} 80 L ${w} 80 Z`}
            fill={color}
          />
        </>
      ) : (
        <>
          <path d={path} stroke={color} strokeWidth={2} fill="none" />
          <path
            d={wavePath(w, baseY, amplitude, offset ? 7 : 5, w)}
            stroke={color}
            strokeWidth={2}
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

/** Build a smooth sine-ish wave path across [0, width]. */
function wavePath(
  width: number,
  baseY: number,
  amp: number,
  periods: number,
  xShift = 0,
): string {
  const segments = 64;
  let d = `M ${xShift} ${baseY}`;
  for (let i = 1; i <= segments; i++) {
    const x = xShift + (width * i) / segments;
    const y =
      baseY +
      Math.sin((i / segments) * Math.PI * 2 * periods) * amp +
      Math.sin((i / segments) * Math.PI * 2 * (periods + 3)) * (amp / 3);
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
