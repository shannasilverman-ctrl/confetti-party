import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Piece = {
  color: string;
  shape: "rect" | "squiggle" | "dot";
  tx: number;
  ty: number;
  tr: number;
  size: number;
  delay: number;
};

const PALETTE = [
  "hsl(var(--primary))",     // coral
  "hsl(var(--accent))",      // amber
  "hsl(var(--secondary))",   // violet
];

function makePieces(count: number, spread: number, rand: () => number): Piece[] {
  const pieces: Piece[] = [];
  const shapes: Piece["shape"][] = ["rect", "squiggle", "dot"];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = spread * (0.55 + rand() * 0.55);
    pieces.push({
      color: PALETTE[i % PALETTE.length],
      shape: shapes[i % shapes.length],
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      tr: (rand() * 720 - 360),
      size: 6 + Math.round(rand() * 6),
      delay: Math.round(rand() * 120),
    });
  }
  return pieces;
}

// Deterministic seeded PRNG so SSR/CSR renders match, but each burst instance varies.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function Piece({ p }: { p: Piece }) {
  const style = {
    left: "50%",
    top: "50%",
    width: p.shape === "squiggle" ? p.size * 1.6 : p.size,
    height: p.shape === "squiggle" ? p.size * 0.35 : p.size,
    backgroundColor: p.color,
    borderRadius: p.shape === "dot" ? "9999px" : p.shape === "squiggle" ? "9999px" : "2px",
    ["--tx" as string]: `${p.tx}px`,
    ["--ty" as string]: `${p.ty}px`,
    ["--tr" as string]: `${p.tr}deg`,
    animationDelay: `${p.delay}ms`,
  } as React.CSSProperties;
  return <span className="absolute -translate-x-1/2 -translate-y-1/2 animate-piece-fly motion-reduce-fade" style={style} />;
}

/**
 * Inline burst that mounts on `active=true` and self-clears after ~1.2s.
 * Toggle `active` from false→true to re-fire.
 */
export function ConfettiBurst({
  active,
  count = 18,
  spread = 90,
  className = "",
}: {
  active: boolean;
  count?: number;
  spread?: number;
  className?: string;
}) {
  const [key, setKey] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    setKey((k) => k + 1);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1300);
    return () => clearTimeout(t);
  }, [active]);

  const pieces = useMemo(() => makePieces(count, spread, seeded(key * 9973 + 17)), [count, spread, key]);
  if (!visible) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-visible ${className}`} aria-hidden>
      {pieces.map((p, i) => (
        <Piece key={`${key}-${i}`} p={p} />
      ))}
    </div>
  );
}

/**
 * Fire a one-off full-viewport confetti burst from the center (or a point).
 * Safe to call from event handlers; auto-cleans DOM after animation.
 */
export function fireConfetti(opts: { origin?: { x: number; y: number }; count?: number; spread?: number } = {}) {
  if (typeof window === "undefined") return;
  // Respect prefers-reduced-motion: the paired toast still communicates the moment.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const { origin, count = 26, spread = 160 } = opts;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;";
  document.body.appendChild(host);

  const cx = origin?.x ?? window.innerWidth / 2;
  const cy = origin?.y ?? window.innerHeight / 3;

  const rand = seeded(Date.now() & 0xffffffff);
  const pieces = makePieces(count, spread, rand);
  pieces.forEach((p) => {
    const el = document.createElement("span");
    const w = p.shape === "squiggle" ? p.size * 1.6 : p.size;
    const h = p.shape === "squiggle" ? p.size * 0.35 : p.size;
    el.style.cssText = [
      "position:absolute",
      `left:${cx}px`,
      `top:${cy}px`,
      `width:${w}px`,
      `height:${h}px`,
      `background:${p.color}`,
      `border-radius:${p.shape === "dot" ? "9999px" : p.shape === "squiggle" ? "9999px" : "2px"}`,
      "transform:translate(-50%,-50%)",
      `--tx:${p.tx}px`,
      `--ty:${p.ty}px`,
      `--tr:${p.tr}deg`,
      `animation:piece-fly 1.1s cubic-bezier(.2,.7,.3,1) ${p.delay}ms forwards`,
    ].join(";");
    host.appendChild(el);
  });

  setTimeout(() => host.remove(), 1600);
}

/**
 * Client-only portal helper (useful if you want a burst anchored to an element
 * but escaping overflow: hidden ancestors).
 */
export function ConfettiOverlay({ active, ...rest }: React.ComponentProps<typeof ConfettiBurst>) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div ref={ref} className="pointer-events-none fixed inset-0 z-[9999]">
      <ConfettiBurst active={active} {...rest} />
    </div>,
    document.body,
  );
}
