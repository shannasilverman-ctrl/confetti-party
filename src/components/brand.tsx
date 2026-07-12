import { Link } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/confetti-logo.png";
import { ConfettiBurst } from "@/components/confetti-burst";

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  const [burst, setBurst] = useState(0);
  return (
    <span
      className={`relative inline-flex overflow-visible ${className}`}
      onMouseEnter={() => setBurst((n) => n + 1)}
      onTouchStart={() => setBurst((n) => n + 1)}
    >
      <img
        src={logo}
        alt="Confetti"
        className="h-full w-full"
        width={512}
        height={512}
      />
      {/* idle shimmer sweep */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
      >
        <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent animate-logo-shimmer" />
      </span>
      <ConfettiBurst active={burst > 0} count={10} spread={44} />
    </span>
  );
}

/**
 * "Confetti" wordmark. Each letter gets a subtle alternating rotation so
 * the word feels like it just fluttered into place. When `animated`, the
 * letters also pop in one-by-one. Rotation composes with the pop keyframes
 * via the --letter-rot custom property and is respected in the final state.
 */
function Wordmark({ text, animated = false }: { text: string; animated?: boolean }) {
  return (
    <span>
      {/* Visually hidden full word for robust screen reader support. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split("").map((ch, i) => {
          const rot = (i % 2 === 0 ? -1 : 1) * 1.5;
          return (
            <span
              key={i}
              className={
                "inline-block " +
                (animated ? "animate-letter-pop motion-reduce-fade" : "")
              }
              style={{
                // custom prop is read by the letter-pop keyframes; also acts as
                // the resting transform when not animated
                ["--letter-rot" as string]: `${rot}deg`,
                transform: `rotate(${rot}deg)`,
                animationDelay: animated ? `${i * 55}ms` : undefined,
              }}
            >
              {ch === " " ? "\u00a0" : ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export function BrandLockup({ animated = false }: { animated?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <BrandMark className="h-9 w-9" />
      <span className="font-display text-xl font-bold tracking-tight text-secondary">
        <Wordmark text="Confetti" animated={animated} />
      </span>
    </Link>
  );
}

export { Wordmark as AnimatedWordmark };
