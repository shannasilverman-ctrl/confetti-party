// Guest-facing Photo Drop card: renders a client-side QR + link.
// Photos never touch Confetti servers.

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Camera, Copy, ExternalLink, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { celebrate } from "@/components/confetti-burst";
import type { PublicPhotoDrop } from "@/lib/rsvp.functions";

export function PhotoDropCard({ drop }: { drop: PublicPhotoDrop }) {
  const [showQr, setShowQr] = useState(false);
  const label = drop?.label || "Photo Drop";

  const providerLabel = useMemo(() => {
    if (!drop) return "";
    switch (drop.provider) {
      case "dropbox_request": return "Dropbox File Request";
      case "google_photos": return "Google Photos album";
      case "kululu": return "Kululu event";
      case "guestpix": return "GuestPix gallery";
      default: return "external upload link";
    }
  }, [drop]);

  if (!drop) return null;

  async function copyLink(evt: React.MouseEvent) {
    if (!drop) return;
    try {
      await navigator.clipboard.writeText(drop.url);
      celebrate("micro", { x: evt.clientX, y: evt.clientY });
      toast.success("Photo Drop link copied.");
    } catch {
      toast.error("Couldn't copy — long-press to copy the link.");
    }
  }

  async function nativeShare() {
    if (!drop) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: label, url: drop.url });
      } catch { /* user cancel */ }
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Photo Drop
          </div>
          <h2 className="mt-0.5 flex items-center gap-2 font-display text-lg font-semibold text-secondary">
            <Camera className="h-5 w-5" /> {label}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload photos straight to the host's {providerLabel}. Confetti never sees them.
          </p>
        </div>
      </div>
      {drop.notes && (
        <p className="mt-2 text-sm text-foreground">{drop.notes}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="festive">
          <a href={drop.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" /> Open uploader
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={copyLink}>
          <Copy className="mr-1 h-4 w-4" /> Copy link
        </Button>
        {canShare && (
          <Button size="sm" variant="outline" onClick={nativeShare}>
            <Share2 className="mr-1 h-4 w-4" /> Share
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowQr((s) => !s)}>
          {showQr ? "Hide QR" : "Show QR"}
        </Button>
      </div>
      {showQr && (
        <div className="mt-4 flex justify-center rounded-xl border border-dashed border-border bg-white p-4">
          <QRCodeSVG value={drop.url} size={168} includeMargin />
        </div>
      )}
    </section>
  );
}
