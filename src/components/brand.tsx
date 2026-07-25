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
    <span aria-hidden="true">
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
      className="flex min-h-11 items-center gap-2"
      onClick={(e) => celebrateAtEvent("micro", e)}
      aria-label="Confetti — home"
    >
      <BrandMark className="h-9 w-9" />
      <span className="font-display text-2xl font-semibold tracking-[-0.045em] text-foreground">
        <Wordmark text="Confetti" animated={animated} />
      </span>
    </Link>
  );
}

export { Wordmark as AnimatedWordmark };
