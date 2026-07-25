// Host-side Photo Drop configuration.
// We NEVER host photos. Store only provider + external HTTPS upload URL.
// Guests upload directly to the host's account on the chosen provider.

import { useRef, useState } from "react";
import { Camera, Copy, Printer, Share2, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useParties } from "@/lib/party-context";
import {
  validatePhotoDropUrl,
  PROVIDERS,
  sanitizePublicPhotoDrop,
  type PhotoDropProvider,
  type PhotoDrop,
} from "@/lib/photo-drop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { openPrintableSign } from "@/lib/printable-sign";
import { celebrate } from "@/components/confetti-burst";

export function PhotoDropEditor({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const existing = party.photoDrop ?? null;

  const [provider, setProvider] = useState<PhotoDropProvider>(
    (existing?.provider as PhotoDropProvider) ?? "dropbox_request",
  );
  const [url, setUrl] = useState(existing?.url ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const printableQrRef = useRef<HTMLDivElement | null>(null);

  function save(evt?: React.MouseEvent) {
    const v = validatePhotoDropUrl(provider, url);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    const next: PhotoDrop = {
      provider,
      url: v.url,
      label: label.trim() || undefined,
      note: note.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    updateParty(party.id, (p) => ({ ...p, photoDrop: next }));
    toast.success("Photo Drop saved.");
    if (evt) celebrate("micro", { x: evt.clientX, y: evt.clientY });
  }

  function clear() {
    updateParty(party.id, (p) => ({ ...p, photoDrop: null }));
    setUrl("");
    setLabel("");
    setNote("");
    toast.success("Photo Drop removed.");
  }

  async function copyLink() {
    if (!existing?.url) return;
    try {
      await navigator.clipboard.writeText(existing.url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy — long-press to copy the link.");
    }
  }

  async function nativeShare() {
    if (!existing?.url) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: existing.label || "Photo Drop", url: existing.url });
      } catch {
        /* user cancel */
      }
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-secondary flex items-center gap-2">
              <Camera className="h-5 w-5" /> Photo Drop
            </h2>
            <p className="text-sm text-muted-foreground">
              Guests upload straight to your account. Confetti never sees the photos.
            </p>
          </div>
          {existing && <Badge variant="secondary">Live</Badge>}
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <Label htmlFor="pd-provider">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as PhotoDropProvider)}>
              <SelectTrigger id="pd-provider" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDERS) as PhotoDropProvider[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PROVIDERS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{PROVIDERS[provider].help}</p>
          </div>
          <div>
            <Label htmlFor="pd-url">Upload URL</Label>
            <Input
              id="pd-url"
              placeholder="https://…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              inputMode="url"
              autoComplete="off"
            />
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pd-label">Label (optional)</Label>
              <Input
                id="pd-label"
                placeholder='e.g. "Share your Thanksgiving pics"'
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="pd-note">Guest note (optional)</Label>
              <Input
                id="pd-note"
                placeholder="Anything you want guests to know"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={160}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="festive" onClick={save}>
              Save Photo Drop
            </Button>
            {existing && (
              <Button variant="outline" onClick={clear}>
                Remove
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Anyone with the QR / link can upload according to your provider's settings. Review your
            provider's privacy controls before sharing publicly.
          </p>
        </div>
      </div>

      {existing && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              ref={printableQrRef}
              className="mx-auto rounded-xl border border-border bg-white p-3"
            >
              <QRCodeSVG value={existing.url} size={140} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {PROVIDERS[existing.provider as PhotoDropProvider]?.label ?? "External link"}
              </div>
              <div className="mt-1 truncate text-sm font-medium text-secondary">
                {existing.label || "Photo Drop"}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{existing.url}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="h-4 w-4" /> Copy link
                </Button>
                {canShare && (
                  <Button size="sm" variant="outline" onClick={nativeShare}>
                    <Share2 className="h-4 w-4" /> Share
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <a href={existing.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Open
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const qrSvg = printableQrRef.current?.querySelector("svg")?.outerHTML;
                    if (
                      !qrSvg ||
                      !openPrintableSign({
                        partyName: party.name,
                        title: existing.label || "Photo Drop",
                        note: existing.note || "Scan to share your pics with the host.",
                        url: existing.url,
                        qrSvg,
                      })
                    ) {
                      toast.error("Couldn’t prepare the printable sign. Try again.");
                    }
                  }}
                >
                  <Printer className="h-4 w-4" /> Printable sign
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
