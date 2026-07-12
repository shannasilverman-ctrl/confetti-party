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
 * Split-letter animation for the "Confetti" wordmark. Runs once on mount.
 */
function AnimatedWordmark({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {text.split("").map((ch, i) => (
        <span
          key={i}
          className="inline-block animate-letter-pop motion-reduce-fade"
          style={{ animationDelay: `${i * 55}ms` }}
          aria-hidden
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

export function BrandLockup({ animated = false }: { animated?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <BrandMark className="h-9 w-9" />
      <span className="font-display text-xl font-semibold tracking-tight text-secondary">
        {animated ? <AnimatedWordmark text="Confetti" /> : "Confetti"}
      </span>
    </Link>
  );
}

export { AnimatedWordmark };
