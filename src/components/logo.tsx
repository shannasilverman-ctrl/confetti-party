import { useId, type SVGProps } from "react";

/**
 * Confetti brand mark — the jewel-gradient tile and white "C" from the
 * original confettiapp.ai identity, redrawn as scalable SVG.
 */
export function LogoMark({
  className,
  title = "Confetti",
  decorative = false,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string; decorative?: boolean }) {
  const gradientId = useId().replace(/:/g, "");
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
      <defs>
        <linearGradient id={gradientId} x1="8" y1="6" x2="58" y2="60">
          <stop stopColor="#8D43D0" />
          <stop offset="0.52" stopColor="#D84F9B" />
          <stop offset="1" stopColor="#FF7A63" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${gradientId})`} />
      <circle cx="13" cy="15" r="2.4" fill="#47D7A5" />
      <rect x="21" y="8" width="4" height="6" rx="1" fill="#FFD65A" transform="rotate(-9 23 11)" />
      <circle cx="49" cy="14" r="2.5" fill="#FFD65A" />
      <rect x="51" y="23" width="4" height="4" rx="0.8" fill="#36D4C4" />
      <circle cx="14" cy="46" r="2.3" fill="#FFD65A" />
      <rect x="47" y="47" width="5" height="5" rx="1" fill="#53D99C" />
      <rect x="9" y="27" width="4" height="4" rx="0.8" fill="#FFFFFF" opacity="0.9" />
      <rect
        x="39"
        y="7"
        width="3"
        height="5"
        rx="0.8"
        fill="#41C9E8"
        transform="rotate(14 40.5 9.5)"
      />
      <path
        d="M45.5 20.5C41.5 16.5 36.8 14.5 31 14.5C20.4 14.5 12.5 22.2 12.5 32.2C12.5 42.6 20.4 50.2 31 50.2C37.2 50.2 42 48 46 43.6"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="8.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Wordmark + mark. The original lockup uses Outfit for a friendly,
 * contemporary counterpoint to the editorial Fraunces headlines.
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
        className={`font-body font-extrabold tracking-[-0.035em] text-foreground ${type} ${wordmarkClassName}`}
      >
        Confetti
      </span>
    </span>
  );
}
