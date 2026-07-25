import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type EventSlide = {
  kicker: string;
  title: [string, string];
  body: string;
  image: string;
  imagePosition?: string;
  video?: string;
};

const EVENT_SLIDES: EventSlide[] = [
  {
    kicker: "Birthday magic",
    title: ["Bring the idea.", "We’ll make it a party."],
    body: "From cake and guests to timing and tasks—Confetti turns the birthday idea into a plan you can actually enjoy.",
    image: "/brand/birthday-hero-v1.jpg",
    imagePosition: "center 46%",
  },
  {
    kicker: "Kids’ parties",
    title: ["Big imaginations.", "Calm grown-ups."],
    body: "Themes, food, activities, helpers, timing, and the things parents remember at the last minute.",
    image: "/brand/kids-party-v1.jpg",
    imagePosition: "58% center",
  },
  {
    kicker: "Weddings & milestones",
    title: ["Every meaningful detail.", "One joyful plan."],
    body: "Coordinate the people, vendors, timing, and shared decisions behind the milestone—without losing the feeling.",
    image: "/brand/ava-liam.jpg",
    imagePosition: "58% center",
  },
  {
    kicker: "Dinner & holidays",
    title: ["Bring everyone together.", "Leave the logistics to us."],
    body: "Menus, dietary needs, who’s bringing what, table timing, and family traditions—all held in one warm, shared plan.",
    image: "/brand/hosting-dinner-v1.jpg",
    imagePosition: "center 54%",
  },
  {
    kicker: "The dance floor",
    title: ["Make the plan.", "Be at the party."],
    body: "When every detail has a home, the host gets to stop coordinating and start celebrating.",
    image: "/brand/confetti-hero-poster.jpg",
    imagePosition: "center",
    video: "/brand/confetti-hero-loop-v1.webm",
  },
];

const OCCASIONS = ["Birthdays", "Weddings", "Holidays", "Shabbat", "BBQs", "Game day"];

export function EventHeroCarousel({
  onStartPlanning,
}: {
  onStartPlanning: (event: React.MouseEvent) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const slide = EVENT_SLIDES[current]!;

  useEffect(() => {
    setReady(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || interacting || reducedMotion) return;
    const timer = window.setInterval(
      () => setCurrent((value) => (value + 1) % EVENT_SLIDES.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, [paused, interacting, reducedMotion]);

  const show = (index: number) => setCurrent((index + EVENT_SLIDES.length) % EVENT_SLIDES.length);

  return (
    <section
      className="relative isolate flex min-h-[44rem] overflow-hidden bg-[hsl(268_58%_9%)] text-white sm:min-h-[48rem]"
      aria-label="Gatherings planned with Confetti"
      aria-roledescription="carousel"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={() => setInteracting(false)}
    >
      <div className="absolute inset-0 -z-20">
        {EVENT_SLIDES.map((candidate, index) => {
          const active = index === current;
          return (
            <div
              key={candidate.kicker}
              className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
                active ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
              aria-hidden={!active}
            >
              {candidate.video && active && !reducedMotion ? (
                <video
                  className="h-full w-full object-cover"
                  style={{ objectPosition: candidate.imagePosition }}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={candidate.image}
                  aria-hidden
                >
                  <source src={candidate.video} type="video/webm" />
                </video>
              ) : (
                <img
                  src={candidate.image}
                  alt=""
                  width={1600}
                  height={900}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: candidate.imagePosition }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,hsl(268_58%_8%/0.9)_0%,hsl(268_58%_8%/0.7)_42%,hsl(268_58%_8%/0.16)_76%),linear-gradient(0deg,hsl(268_58%_7%/0.72),transparent_62%)]"
        aria-hidden
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col justify-center px-6 pb-28 pt-36 sm:px-8 sm:pb-32 sm:pt-40">
        <div className="max-w-2xl">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md"
            aria-live="polite"
          >
            <Sparkles className="h-3.5 w-3.5 text-[hsl(38_92%_66%)]" aria-hidden />
            {slide.kicker}
          </div>
          <h1 className="mt-7 font-display text-[2.9rem] font-medium leading-[0.94] tracking-[-0.05em] text-white sm:text-7xl md:text-[5rem]">
            {slide.title[0]}
            <br />
            <span className="italic text-white">{slide.title[1]}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base font-medium leading-7 text-white/82 sm:text-lg">
            {slide.body}
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button size="lg" variant="festive" onClick={onStartPlanning}>
              Tell Confetti what you’re thinking <ArrowRight />
            </Button>
            <Link
              to="/talk"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white underline decoration-white/35 underline-offset-4 hover:decoration-white"
            >
              Or talk it out <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-7 flex max-w-xl flex-wrap gap-2" aria-label="Gathering types">
            {OCCASIONS.map((occasion) => (
              <span
                key={occasion}
                className="rounded-full border border-white/25 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md"
              >
                {occasion}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-5 z-10 mx-auto flex max-w-6xl items-center justify-end gap-2 px-5 sm:bottom-7 sm:px-8">
        <button
          type="button"
          onClick={() => show(current - 1)}
          disabled={!ready}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-black/30 text-white backdrop-blur-md transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Previous event"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3 py-2 backdrop-blur-md">
          {EVENT_SLIDES.map((candidate, index) => (
            <button
              key={candidate.kicker}
              type="button"
              onClick={() => show(index)}
              disabled={!ready}
              className={`h-2.5 rounded-full transition-[width,background-color] motion-reduce:transition-none ${
                index === current ? "w-7 bg-white" : "w-2.5 bg-white/45 hover:bg-white/75"
              }`}
              aria-label={`Show ${candidate.kicker}`}
              aria-pressed={index === current}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          disabled={!ready}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-black/30 text-white backdrop-blur-md transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={paused ? "Play event carousel" : "Pause event carousel"}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => show(current + 1)}
          disabled={!ready}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-black/30 text-white backdrop-blur-md transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Next event"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
