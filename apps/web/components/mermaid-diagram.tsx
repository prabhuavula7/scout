"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ReactZoomPanPinchRef>(null);
  const id = useId().replace(/:/g, "-");
  const [error, setError] = useState<string | null>(null);
  const isDark = useIsDarkMode();

  function fitToPanel() {
    const svg = contentRef.current?.querySelector("svg");
    if (!svg || !wrapperRef.current || !zoomRef.current) return;
    const svgBox = svg.getBoundingClientRect();
    const panelBox = wrapperRef.current.getBoundingClientRect();
    if (svgBox.width === 0 || svgBox.height === 0) return;
    const scale = Math.min(panelBox.width / svgBox.width, panelBox.height / svgBox.height, 1) * 0.92;
    zoomRef.current.centerView(scale, 0);
  }

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, theme: isDark ? "dark" : "neutral", securityLevel: "strict" });
      try {
        // Vary the render id with the theme -- mermaid caches its internal render state per id,
        // and reusing the same id across a theme switch can leave stale (wrong-theme) styling in the output.
        const { svg } = await mermaid.render(`mermaid-${id}-${isDark ? "dark" : "light"}`, chart);
        if (!cancelled && contentRef.current) {
          contentRef.current.innerHTML = svg;
          requestAnimationFrame(fitToPanel);
        }
      } catch {
        if (!cancelled) setError("Could not render this diagram.");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart, id, isDark]);

  if (error) {
    return <pre className="rounded-lg bg-stone-100 p-3 text-xs dark:bg-stone-900">{chart}</pre>;
  }

  return (
    <div
      ref={wrapperRef}
      className="relative h-[420px] w-full overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950"
    >
      <TransformWrapper ref={zoomRef} initialScale={1} minScale={0.2} maxScale={3} limitToBounds={false}>
        {(zoom) => (
          <>
            <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full">
              <div ref={contentRef} className="flex h-full w-full items-center justify-center p-6" />
            </TransformComponent>
            <div className="absolute bottom-3 left-3 flex gap-1 rounded-lg border border-stone-200 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
              <button
                type="button"
                onClick={() => zoom.zoomIn()}
                aria-label="Zoom in"
                className="rounded p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => zoom.zoomOut()}
                aria-label="Zoom out"
                className="rounded p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={fitToPanel}
                aria-label="Fit to panel"
                className="rounded p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <Maximize className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
