import type { SVGProps } from "react";

/**
 * Confetti brand mark — a plum ribbon "C" with three confetti pieces.
 * Derived from the approved brand concept, drawn as an SVG so it scales
 * cleanly from 16px (favicon) up to hero sizes with no raster loss.
 */
export function LogoMark({
  className,
  title = "Confetti",
  decorative = false,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string; decorative?: boolean }) {
  const a11y = decorative
    ? { "aria-hidden": true as const, focusable: false as const }
    : { role: "img" as const, "aria-label": title };
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
      className={className}
      {...props}
    >
      {!decorative && <title>{title}</title>}

      {/* Ribbon C — two overlapping strokes give it the ribbon-fold feel */}
      <path
        d="M46 16.5C41 12 34.5 10.5 28 12.5 18.5 15.4 12.5 24.5 13.7 34.3 14.8 43.4 22 50.4 31.2 51.5 37.6 52.3 43.9 50 48.2 45.6"
        fill="none"
        stroke="var(--brand-plum, hsl(268 55% 32%))"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path
        d="M45 20C41.5 17 36.8 15.8 32 17 25 18.8 20.5 25 21.3 32.2 22 39 27.5 44 34.4 44.4"
        fill="none"
        stroke="var(--brand-plum, hsl(268 55% 32%))"
        strokeOpacity="0.55"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Confetti pieces flying off the top-right of the C */}
      <rect
        x="48.5"
        y="10.5"
        width="5"
        height="5"
        rx="1"
        transform="rotate(18 51 13)"
        fill="var(--brand-coral, hsl(10 82% 62%))"
      />
      <circle cx="57" cy="19" r="2.4" fill="var(--brand-gold, hsl(38 92% 58%))" />
      <path d="M52 22 L56 22 L54 26 Z" fill="var(--brand-gold, hsl(38 92% 58%))" opacity="0.9" />
    </svg>
  );
}

/**
 * Wordmark + mark. Uses the display serif so it matches the brand board.
 * `size` toggles between tight (nav) and hero (landing) proportions.
 */
export function LogoLockup({
  size = "nav",
  className = "",
  wordmarkClassName = "",
}: {
  size?: "nav" | "hero";
  className?: string;
  wordmarkClassName?: string;
}) {
  const markSize = size === "hero" ? "h-10 w-10 sm:h-12 sm:w-12" : "h-8 w-8";
  const type = size === "hero" ? "text-2xl sm:text-3xl" : "text-xl";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={markSize} decorative />
      <span
        className={`font-display font-semibold tracking-tight text-secondary ${type} ${wordmarkClassName}`}
      >
        Confetti
      </span>
    </span>
  );
}
