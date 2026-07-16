export type SeasonalMoment = {
  id: string;
  label: string;
  headline: string;
  cta: string;
  ctaHref: string;
  start: string; // ISO date (YYYY-MM-DD)
  end: string; // ISO date (YYYY-MM-DD), inclusive
};

export const SEASONAL_MOMENTS: SeasonalMoment[] = [
  {
    id: "world-cup",
    label: "WORLD CUP FINAL",
    headline: "The final's Sunday. Plan the watch party.",
    cta: "Start planning",
    ctaHref: "/app?new=true",
    start: "2026-07-13",
    end: "2026-07-19",
  },
  {
    id: "nfl-kickoff",
    label: "FOOTBALL SEASON",
    headline: "Kickoff's back. Get the watch party on the calendar.",
    cta: "Start planning",
    ctaHref: "/app?new=true",
    start: "2026-09-01",
    end: "2026-09-30",
  },
  {
    id: "halloween",
    label: "HALLOWEEN",
    headline: "Throw the Halloween party they'll talk about.",
    cta: "Start planning",
    ctaHref: "/app?new=true",
    start: "2026-10-10",
    end: "2026-10-31",
  },
  {
    id: "thanksgiving",
    label: "THANKSGIVING",
    headline: "Host Thanksgiving without the group-chat chaos.",
    cta: "Start planning",
    ctaHref: "/app?new=true",
    start: "2026-11-15",
    end: "2026-11-26",
  },
  {
    id: "new-years",
    label: "NEW YEAR'S EVE",
    headline: "Ring it in. Plan the NYE party.",
    cta: "Start planning",
    ctaHref: "/app?new=true",
    start: "2026-12-20",
    end: "2026-12-31",
  },
  {
    id: "super-bowl",
    label: "BIG GAME",
    headline: "The big game deserves a real watch party.",
    cta: "Start planning",
    ctaHref: "/app?new=true",
    start: "2027-01-25",
    end: "2027-02-08",
  },
];

export function getActiveSeasonalMoment(now: Date = new Date()): SeasonalMoment | null {
  const t = now.getTime();
  for (const m of SEASONAL_MOMENTS) {
    const start = new Date(`${m.start}T00:00:00`).getTime();
    const end = new Date(`${m.end}T23:59:59.999`).getTime();
    if (t >= start && t <= end) return m;
  }
  return null;
}
