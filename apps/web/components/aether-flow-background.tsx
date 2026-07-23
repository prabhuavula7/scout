/**
 * Ambient hero backdrop: soft, blurred color washes that slowly drift and
 * scale, like light moving through fog. Pure CSS (no canvas, no JS color
 * parsing): cheap, GPU-composited, and respects prefers-reduced-motion via
 * motion-safe:/motion-reduce: variants instead of a JS media query check.
 */
export function AetherFlowBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_75%_75%_at_50%_40%,black_40%,transparent_100%)]"
    >
      <div className="absolute inset-0 opacity-70 mix-blend-multiply dark:opacity-60 dark:mix-blend-screen">
        <div className="motion-safe:animate-aether-a absolute top-1/4 left-1/4 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-400/40 blur-[90px]" />
        <div className="motion-safe:animate-aether-b absolute top-1/2 left-3/4 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-aether-gold/40 blur-[90px]" />
        <div className="motion-safe:animate-aether-c absolute top-3/4 left-1/3 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/30 blur-[90px]" />
      </div>
    </div>
  );
}
