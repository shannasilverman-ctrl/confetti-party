import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { ConfettiBurst, celebrateAtEvent } from "@/components/confetti-burst";

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  const [burst, setBurst] = useState(0);
  return (
    <span
      className={`relative inline-flex overflow-visible text-secondary ${className}`}
      onMouseEnter={() => setBurst((n) => n + 1)}
      onTouchStart={() => setBurst((n) => n + 1)}
      aria-hidden="true"
    >
      <LogoMark className="h-full w-full" decorative />
      <ConfettiBurst active={burst > 0} count={10} spread={44} />
    </span>
  );
}

/**
 * Wordmark, rendered in Confetti's editorial display face. `animated` fades
 * letters in on mount.
 * The visible glyphs are aria-hidden — the parent lockup Link
 * owns the single accessible name.
 */
function Wordmark({ text, animated = false }: { text: string; animated?: boolean }) {
  return (
    <span aria-hidden="true" className="whitespace-nowrap">
      {text.split("").map((ch, i) => (
        <span
          key={i}
          className={"inline-block " + (animated ? "animate-letter-pop motion-reduce-fade" : "")}
          style={{ animationDelay: animated ? `${i * 55}ms` : undefined }}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </span>
  );
}

export function BrandLockup({ animated = false }: { animated?: boolean }) {
  return (
    <Link
      to="/"
      className="flex min-h-11 min-w-0 flex-nowrap items-center gap-2"
      onClick={(e) => celebrateAtEvent("micro", e)}
      aria-label="Confetti — home"
    >
      <BrandMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
      <span className="relative shrink-0 whitespace-nowrap font-sans text-2xl font-semibold lowercase tracking-[-0.03em] text-foreground">
        <Wordmark text="confett" animated={animated} />
        <span className="relative inline-block" aria-hidden="true">
          {"\u0131"}
          {/* The tittle IS the mark — solid master, since at this size the fold
              cannot render. Never ships as live text: U+0131 would reach a
              screen reader as a dotless i. */}
          <LogoMark
            solid
            decorative
            className="absolute left-1/2 top-[-0.54em] h-[0.4em] w-[0.4em] -translate-x-1/2"
          />
        </span>
      </span>
    </Link>
  );
}

export { Wordmark as AnimatedWordmark };
