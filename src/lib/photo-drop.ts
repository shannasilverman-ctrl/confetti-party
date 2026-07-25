// Photo Drop — Confetti never hosts guest photos. We only store the host's
// external upload URL (Dropbox File Request, Google Photos album, Kululu,
// GuestPix, or a custom HTTPS destination) and generate a QR client-side.

export type PhotoDropProvider =
  | "dropbox_request"
  | "google_photos"
  | "kululu"
  | "guestpix"
  | "custom";

export type PhotoDrop = {
  provider: PhotoDropProvider;
  url: string;
  label?: string;
  note?: string;
  updatedAt: string;
};

export const PROVIDERS: Record<
  PhotoDropProvider,
  { label: string; help: string; hosts: string[] }
> = {
  dropbox_request: {
    label: "Dropbox File Request",
    help: "Create a File Request in Dropbox, then paste the request URL.",
    hosts: ["dropbox.com", "www.dropbox.com"],
  },
  google_photos: {
    label: "Google Photos album",
    help: "Create a shared album with 'Collaborate' on, then paste the share link.",
    hosts: ["photos.google.com", "photos.app.goo.gl"],
  },
  kululu: {
    label: "Kululu",
    help: "Set up an event on Kululu and paste the upload link.",
    hosts: ["kululu.com", "app.kululu.com"],
  },
  guestpix: {
    label: "GuestPix",
    help: "Create your event on GuestPix and paste the guest upload URL.",
    hosts: ["guestpix.com", "app.guestpix.com"],
  },
  custom: {
    label: "Custom HTTPS destination",
    help: "Any HTTPS URL that lets guests upload — you own the account.",
    hosts: [],
  },
};

export function validatePhotoDropUrl(
  provider: PhotoDropProvider,
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste your upload URL." };
  if (trimmed.length > 2048) return { ok: false, error: "URL is too long." };
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, error: "That doesn't look like a URL." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "URL must start with https://." };
  const cfg = PROVIDERS[provider];
  if (cfg.hosts.length && !cfg.hosts.some((h) => u.host === h || u.host.endsWith(`.${h}`))) {
    return {
      ok: false,
      error: `That doesn't look like a ${cfg.label} URL (expected ${cfg.hosts[0]}).`,
    };
  }
  return { ok: true, url: u.toString() };
}
