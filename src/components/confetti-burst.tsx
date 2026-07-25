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
  "hsl(var(--primary))", // coral
  "hsl(var(--accent))", // amber
  "hsl(var(--secondary))", // violet
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
      tr: rand() * 720 - 360,
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
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2 animate-piece-fly motion-reduce-fade"
      style={style}
    />
  );
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

  const pieces = useMemo(
    () => makePieces(count, spread, seeded(key * 9973 + 17)),
    [count, spread, key],
  );
  if (!visible) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-visible ${className}`}
      aria-hidden
    >
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
export function fireConfetti(
  opts: { origin?: { x: number; y: number }; count?: number; spread?: number } = {},
) {
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
 * Physics-based confetti cannon. Pieces launch upward from `origin` with
 * random horizontal velocity, arc under gravity, tumble, and fade. DOM-light
 * spans self-clean after the animation. Distinct from the radial `fireConfetti`.
 */
const CANNON_PALETTE = [
  "hsl(10 82% 62%)", // coral (primary)
  "hsl(268 55% 42%)", // violet (secondary)
  "hsl(38 92% 58%)", // amber (accent)
  "hsl(340 75% 62%)", // pink
  "hsl(210 82% 60%)", // blue
];

export function fireCannon(opts: { origin?: { x: number; y: number }; count?: number } = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const { origin, count = 70 } = opts;
  const cx = origin?.x ?? window.innerWidth / 2;
  const cy = origin?.y ?? window.innerHeight / 2;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;";
  document.body.appendChild(host);

  const rand = seeded((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) & 0xffffffff);
  const gravity = 1600; // px/s^2
  let maxDur = 0;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    const isRect = rand() > 0.45;
    const w = isRect ? 6 + Math.round(rand() * 6) : 7 + Math.round(rand() * 5);
    const h = isRect ? 9 + Math.round(rand() * 7) : w;
    const color = CANNON_PALETTE[Math.floor(rand() * CANNON_PALETTE.length)];
    el.style.cssText = [
      "position:absolute",
      `left:${cx}px`,
      `top:${cy}px`,
      `width:${w}px`,
      `height:${h}px`,
      `background:${color}`,
      `border-radius:${isRect ? "1.5px" : "9999px"}`,
      "transform:translate(-50%,-50%)",
      "will-change:transform,opacity",
    ].join(";");
    host.appendChild(el);

    // Physics: upward kick + random horizontal, then gravity arc.
    const angle = -Math.PI / 2 + (rand() - 0.5) * (Math.PI * 0.9); // roughly upward, wide cone
    const speed = 520 + rand() * 480; // px/s
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const dur = 1100 + rand() * 800; // ms
    const t = dur / 1000; // s
    const rot = rand() * 1440 - 720;

    // Sample the arc so easing applies to a real trajectory.
    const steps = 8;
    const frames: Keyframe[] = [];
    for (let s = 0; s <= steps; s++) {
      const p = s / steps;
      const tt = p * t;
      const x = vx * tt;
      const y = vy * tt + 0.5 * gravity * tt * tt;
      const r = rot * p;
      // fade out over last 30%
      const opacity = p < 0.1 ? p / 0.1 : p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;
      frames.push({
        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${r}deg)`,
        opacity,
      });
    }
    el.animate(frames, {
      duration: dur,
      easing: "cubic-bezier(.18,.7,.3,1)",
      fill: "forwards",
      delay: Math.round(rand() * 60),
    });
    if (dur > maxDur) maxDur = dur;
  }

  setTimeout(() => host.remove(), maxDur + 200);
}

/**
 * Global throttled celebration helper with presets. Every burst flows
 * through fireConfetti / fireCannon (which already skip when the user
 * prefers reduced motion), and a shared 300ms throttle prevents stacked
 * bursts from rapid clicking.
 */
let __lastCelebrateAt = 0;
export type CelebrateIntensity = "micro" | "small" | "big" | "cannon";
export function celebrate(intensity: CelebrateIntensity, origin?: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - __lastCelebrateAt < 300) return;
  __lastCelebrateAt = now;
  if (intensity === "cannon") {
    fireCannon({ origin });
    return;
  }
  const presets: Record<
    Exclude<CelebrateIntensity, "cannon">,
    { count: number; spread: number }
  > = {
    micro: { count: 7, spread: 50 },
    small: { count: 14, spread: 100 },
    big: { count: 32, spread: 180 },
  };
  const { count, spread } = presets[intensity];
  fireConfetti({ origin, count, spread });
}

/** Fire a burst positioned at a pointer event, falling back to the
 *  target element's center when clientX/Y aren't meaningful (keyboard
 *  activation, synthetic events). */
export function celebrateAtEvent(
  intensity: CelebrateIntensity,
  e: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null },
) {
  let origin: { x: number; y: number } | undefined;
  if (typeof e.clientX === "number" && typeof e.clientY === "number" && (e.clientX || e.clientY)) {
    origin = { x: e.clientX, y: e.clientY };
  } else if (e.currentTarget && e.currentTarget instanceof Element) {
    const r = e.currentTarget.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  celebrate(intensity, origin);
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
