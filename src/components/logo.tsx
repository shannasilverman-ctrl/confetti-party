import type { SVGProps } from "react";

/**
 * Confetti's mark: one piece of confetti, bent, caught mid-air.
 *
 * A scatter is a picture of confetti and reads as clipart; a single tumbling
 * piece is an object. Paper folds as it turns, so the mark is two faces — one
 * to the light, one turning away — sharing a hairline fold and rotated off the
 * vertical so it reads as falling rather than standing.
 *
 * Two masters, one rule. Above 32px the fold is drawn; below it the silhouette
 * (the exact convex hull of both faces) carries the mark alone, because a
 * diagonal 1px gap only aliases into grey mush. `solid` forces the small
 * master for favicons, tittles and any control-sized use.
 *
 * Interim artwork: it still owes a designer's optical pass and trademark
 * clearance. See ~/test/confetti-logo-brief.md.
 */

const TRANSFORM = "translate(.27 -.09) rotate(32 32 32)";
const FACE_LIT = "16,19.5 33,17 31,47 14,49.5";
const FACE_TURNED = "40.49,17.5 49.64,14.94 47.64,44.94 38.49,47.5";
const SILHOUETTE = "16,19.5 49.64,14.94 47.64,44.94 14,49.5";

/** Fill + same-colour stroke with round joins softens the corners. */
function face(points: string, fill: string) {
  return (
    <polygon points={points} fill={fill} stroke={fill} strokeWidth="2.4" strokeLinejoin="round" />
  );
}

export function LogoMark({
  className,
  title = "Confetti",
  decorative = false,
  solid = false,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string; decorative?: boolean; solid?: boolean }) {
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
      <g transform={TRANSFORM}>
        {solid ? (
          face(SILHOUETTE, "var(--brand-coral)")
        ) : (
          <>
            {face(FACE_LIT, "var(--brand-coral)")}
            {face(FACE_TURNED, "var(--brand-coral-deep, hsl(10 78% 38%))")}
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * Wordmark + mark. Set lowercase in Outfit SemiBold: a low-contrast geometric
 * sans keeps a clean straight stem on the i, which the mark then replaces as
 * its tittle — one object doing both jobs. Fraunces is deliberately not used
 * here; its thins collapse at small sizes and its serifs collide with a
 * replaced tittle.
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
        className={`font-sans font-semibold lowercase tracking-[-0.03em] text-foreground ${type} ${wordmarkClassName}`}
      >
        Confetti
      </span>
    </span>
  );
}
