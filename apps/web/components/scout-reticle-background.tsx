"use client";

import { useEffect, useRef } from "react";

const VIEWBOX = 520;
const CENTER = VIEWBOX / 2;
const TICK_COUNT = 24;

// Math.cos/sin can differ in their last binary digit between server (Node)
// and client (browser) V8 builds, which turns into a hydration mismatch once
// serialized as SVG attribute strings. Round to a fixed precision so both
// sides always produce an identical string.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const TICKS = Array.from({ length: TICK_COUNT }, (_, i) => {
  const angle = (i / TICK_COUNT) * Math.PI * 2;
  const long = i % 6 === 0;
  const rOuter = 230;
  const rInner = long ? 208 : 220;
  return {
    x1: round(CENTER + Math.cos(angle) * rOuter),
    y1: round(CENTER + Math.sin(angle) * rOuter),
    x2: round(CENTER + Math.cos(angle) * rInner),
    y2: round(CENTER + Math.sin(angle) * rInner),
    long,
  };
});

const CORNERS: Array<[number, number, number, number]> = [
  [24, 24, 1, 1],
  [496, 24, -1, 1],
  [24, 496, 1, -1],
  [496, 496, -1, -1],
];

/**
 * Hero background: a large scope/reticle, blueprint-style optics schematic
 * (Scout, as in reconnaissance), that eases toward the cursor rather than
 * decorative particles. Subtle by design: thin strokes, low opacity, kept
 * behind the copy via a lower z-index and the same edge-fade mask as the
 * other hero layers.
 */
export function ScoutReticleBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const reticle = reticleRef.current;
    if (!container || !reticle) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let hasPointer = false;
    let raf = 0;

    function setCenter() {
      const rect = container!.getBoundingClientRect();
      targetX = rect.width / 2;
      targetY = rect.height / 2;
      if (!hasPointer) {
        currentX = targetX;
        currentY = targetY;
        reticle!.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    }

    function handlePointerMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      targetX = e.clientX - rect.left;
      targetY = e.clientY - rect.top;
      hasPointer = true;
    }

    function handlePointerLeave() {
      hasPointer = false;
    }

    function step() {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      reticle!.style.transform = `translate(${currentX}px, ${currentY}px)`;
      raf = requestAnimationFrame(step);
    }

    setCenter();
    if (!prefersReducedMotion) raf = requestAnimationFrame(step);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("resize", setCenter);
    document.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", setCenter);
      document.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_75%_75%_at_50%_40%,white_50%,transparent_100%)]"
    >
      <div ref={reticleRef} className="absolute top-0 left-0 will-change-transform">
        <svg
          width={VIEWBOX}
          height={VIEWBOX}
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="-translate-x-1/2 -translate-y-1/2 text-accent-500"
          style={{ overflow: "visible" }}
        >
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <g className="motion-safe:animate-[spin_70s_linear_infinite]" style={{ transformOrigin: "50% 50%" }}>
              <circle cx={CENTER} cy={CENTER} r="190" opacity="0.3" strokeDasharray="1 13" />
            </g>
            <circle cx={CENTER} cy={CENTER} r="230" opacity="0.3" />
            <circle cx={CENTER} cy={CENTER} r="150" opacity="0.2" />
            <circle cx={CENTER} cy={CENTER} r="80" opacity="0.4" />

            {/* Crosshair, with a gap around the center like a scope reticle. */}
            <line x1={CENTER} y1={CENTER - 210} x2={CENTER} y2={CENTER - 95} opacity="0.45" />
            <line x1={CENTER} y1={CENTER + 95} x2={CENTER} y2={CENTER + 210} opacity="0.45" />
            <line x1={CENTER - 210} y1={CENTER} x2={CENTER - 95} y2={CENTER} opacity="0.45" />
            <line x1={CENTER + 95} y1={CENTER} x2={CENTER + 210} y2={CENTER} opacity="0.45" />

            {TICKS.map((t, i) => (
              <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} opacity={t.long ? 0.5 : 0.25} />
            ))}

            {CORNERS.map(([x, y, dx, dy], i) => (
              <path key={i} d={`M ${x} ${y + dy * 26} L ${x} ${y} L ${x + dx * 26} ${y}`} opacity="0.4" />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
