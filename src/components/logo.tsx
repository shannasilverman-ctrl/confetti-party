import type { SVGProps } from "react";

/**
 * Confetti's open-C spark.
 *
 * The opening is intentional: a party plan does not need to be complete before
 * someone can begin. The small four-point spark sits at the moment an idea
 * becomes a gathering. Keeping the mark single-color makes it legible as a
 * favicon, on photography, and inside product controls.
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
      <path
        d="M47.5 17.2C43 12.7 37.8 10.5 31.5 10.5C19.4 10.5 10.2 19.6 10.2 31.9C10.2 44.2 19.4 53.4 31.5 53.4C38.4 53.4 44.2 50.8 48.6 45.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="9.5"
        strokeLinecap="round"
      />
      <path
        d="M48 4.5L50.9 13L59.5 16L50.9 18.9L48 27.5L45.1 18.9L36.5 16L45.1 13L48 4.5Z"
        fill="var(--brand-coral)"
      />
    </svg>
  );
}

/**
 * Wordmark + mark. Fraunces gives the lockup the same warm editorial voice as
 * the product's most memorable moments; Outfit remains the practical UI face.
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
        className={`font-display font-semibold tracking-[-0.045em] text-foreground ${type} ${wordmarkClassName}`}
      >
        Confetti
      </span>
    </span>
  );
}
