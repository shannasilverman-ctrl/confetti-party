import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Download,
  ImagePlus,
  LockKeyhole,
  RotateCcw,
  Share2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateOnly } from "@/lib/date-only";
import {
  coverCrop,
  PHOTO_BOOTH_FRAMES,
  photoBoothFilename,
  photoBoothTitle,
  type PhotoBoothFrame,
} from "@/lib/photo-booth";
import type { Theme } from "@/lib/themes";

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1350;
const FALLBACK_PALETTE = [
  "hsl(348 78% 62%)",
  "hsl(268 55% 30%)",
  "hsl(39 76% 62%)",
  "hsl(338 70% 90%)",
] as const;

type LoadedPhoto = {
  image: HTMLImageElement;
  objectUrl: string;
};

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startingSize: number,
  minimumSize: number,
  family: string,
): number {
  let size = startingSize;
  while (size > minimumSize) {
    context.font = `700 ${size}px ${family}`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawPhoto(
  canvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  eventName: string,
  dateLabel: string,
  frame: PhotoBoothFrame,
  palette: readonly string[],
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  const crop = coverCrop(photo.naturalWidth, photo.naturalHeight, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  context.drawImage(photo, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  const title = photoBoothTitle(eventName);
  const serif = '"Georgia", "Times New Roman", serif';
  const sans = '"Arial", "Helvetica", sans-serif';

  if (frame === "editorial") {
    const ribbonHeight = 245;
    context.fillStyle = "hsl(38 44% 97% / 0.96)";
    context.fillRect(0, OUTPUT_HEIGHT - ribbonHeight, OUTPUT_WIDTH, ribbonHeight);
    context.fillStyle = palette[1] ?? FALLBACK_PALETTE[1];
    context.fillRect(70, OUTPUT_HEIGHT - ribbonHeight + 42, 78, 6);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    const fontSize = fitText(context, title, 890, 72, 42, serif);
    context.font = `700 ${fontSize}px ${serif}`;
    context.fillText(title, 70, OUTPUT_HEIGHT - 92, 890);
    context.font = `600 26px ${sans}`;
    context.fillStyle = "hsl(268 20% 32%)";
    context.fillText(dateLabel.toUpperCase(), 72, OUTPUT_HEIGHT - 46);
    context.textAlign = "right";
    context.font = `700 24px ${serif}`;
    context.fillStyle = palette[0] ?? FALLBACK_PALETTE[0];
    context.fillText("CONFETTI", OUTPUT_WIDTH - 72, OUTPUT_HEIGHT - 46);
    return;
  }

  const gradient = context.createLinearGradient(0, 700, 0, OUTPUT_HEIGHT);
  gradient.addColorStop(0, "rgba(20, 10, 28, 0)");
  gradient.addColorStop(1, "rgba(20, 10, 28, 0.84)");
  context.fillStyle = gradient;
  context.fillRect(0, 620, OUTPUT_WIDTH, OUTPUT_HEIGHT - 620);

  if (frame === "confetti") {
    context.lineWidth = 18;
    context.strokeStyle = palette[3] ?? FALLBACK_PALETTE[3];
    context.strokeRect(28, 28, OUTPUT_WIDTH - 56, OUTPUT_HEIGHT - 56);

    const dots = [
      [78, 92, 22, palette[0]],
      [154, 58, 13, palette[2]],
      [OUTPUT_WIDTH - 82, 108, 19, palette[1]],
      [OUTPUT_WIDTH - 142, 62, 11, palette[3]],
      [72, OUTPUT_HEIGHT - 310, 14, palette[2]],
      [OUTPUT_WIDTH - 78, OUTPUT_HEIGHT - 348, 18, palette[0]],
    ] as const;
    for (const [x, y, radius, color] of dots) {
      context.beginPath();
      context.fillStyle = color ?? FALLBACK_PALETTE[0];
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.lineWidth = 8;
    context.strokeStyle = "hsl(38 44% 97% / 0.92)";
    context.strokeRect(40, 40, OUTPUT_WIDTH - 80, OUTPUT_HEIGHT - 80);
    context.lineWidth = 2;
    context.strokeRect(58, 58, OUTPUT_WIDTH - 116, OUTPUT_HEIGHT - 116);
  }

  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "white";
  const fontSize = fitText(context, title, 880, 78, 44, serif);
  context.font = `700 ${fontSize}px ${serif}`;
  context.shadowColor = "rgba(0, 0, 0, 0.35)";
  context.shadowBlur = 16;
  context.fillText(title, OUTPUT_WIDTH / 2, OUTPUT_HEIGHT - 145, 880);
  context.shadowBlur = 0;

  context.font = `600 27px ${sans}`;
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.fillText(dateLabel.toUpperCase(), OUTPUT_WIDTH / 2, OUTPUT_HEIGHT - 92);

  if (frame === "keepsake") {
    context.font = `700 21px ${serif}`;
    context.fillStyle = palette[3] ?? FALLBACK_PALETTE[3];
    context.fillText("MADE WITH CONFETTI", OUTPUT_WIDTH / 2, OUTPUT_HEIGHT - 52);
  }
}

function loadPhoto(file: File): Promise<LoadedPhoto> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image_load_failed"));
    };
    image.src = objectUrl;
  });
}

export function PersonalizedPhotoBooth({
  eventName,
  date,
  theme,
  autoOpen = false,
}: {
  eventName: string;
  date: string;
  theme?: Pick<Theme, "name" | "palette"> | null;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [frame, setFrame] = useState<PhotoBoothFrame>("confetti");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const autoOpenedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const palette = theme?.palette ?? FALLBACK_PALETTE;
  const dateLabel = useMemo(
    () =>
      formatDateOnly(date, {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [date],
  );

  useEffect(() => {
    setHydrated(true);
    const openedFromSign = window.location.hash === "#party-booth";
    if ((autoOpen || openedFromSign) && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [autoOpen]);

  useEffect(() => {
    if (!photo || !canvasRef.current) return;
    drawPhoto(canvasRef.current, photo.image, eventName, dateLabel, frame, palette);
  }, [dateLabel, eventName, frame, palette, photo]);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.objectUrl);
    },
    [photo],
  );

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a photo from your camera or photo library.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await loadPhoto(file);
      setPhoto((current) => {
        if (current) URL.revokeObjectURL(current.objectUrl);
        return next;
      });
    } catch {
      setError("That photo couldn't be opened. Try another image.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
    setError(null);
  }

  async function savePhoto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("image_export_failed");
      const filename = photoBoothFilename(eventName);
      const file = new File([blob], filename, { type: blob.type });
      const shareData = { files: [file], title: photoBoothTitle(eventName) };

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare(shareData)
      ) {
        try {
          await navigator.share(shareData);
          toast.success("Your party photo is ready.");
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") return;
        }
      }

      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      toast.success("Saved to your downloads.");
    } catch {
      setError("We couldn't save that photo. Try again from your browser's share menu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-card"
      aria-labelledby="party-booth-heading"
      data-hydrated={hydrated ? "true" : "false"}
    >
      <div className="relative bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.2),transparent_42%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.6))] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Camera className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              New · Party Booth
            </div>
            <h2
              id="party-booth-heading"
              className="mt-1 font-display text-xl font-semibold text-secondary"
            >
              Take home a photo made for {photoBoothTitle(eventName)}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Add the event's own frame, then save it straight to your phone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="festive" className="min-h-11 sm:w-auto">
                <Sparkles className="h-4 w-4" aria-hidden />
                Open the photo booth
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto p-0">
              <DialogHeader className="px-5 pt-6 text-left sm:px-6">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Camera className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                      {theme?.name ?? "A Confetti original"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{dateLabel}</div>
                  </div>
                </div>
                <DialogTitle className="font-display text-2xl">
                  {photo ? "Make it party-official" : `${photoBoothTitle(eventName)} Party Booth`}
                </DialogTitle>
                <DialogDescription>
                  {photo
                    ? `Choose a ${theme?.name ? `${theme.name} ` : ""}finish for ${photoBoothTitle(eventName)}.`
                    : `Take a photo, add the frame made for ${photoBoothTitle(eventName)}, and keep it on your phone.`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 px-5 pb-6 sm:px-6">
                {!photo ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-center text-sm font-semibold text-secondary transition hover:bg-primary/10">
                      <Camera className="h-6 w-6 text-primary" aria-hidden />
                      Take a photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="sr-only"
                        onChange={(event) => {
                          void choosePhoto(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 p-4 text-center text-sm font-semibold text-secondary transition hover:bg-muted/60">
                      <ImagePlus className="h-6 w-6 text-primary" aria-hidden />
                      Choose from library
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => {
                          void choosePhoto(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-center overflow-hidden rounded-2xl bg-secondary/5 shadow-inner">
                      <canvas
                        ref={canvasRef}
                        className="aspect-[4/5] h-auto max-h-[42dvh] w-auto max-w-full"
                        aria-label={`Preview of your ${photoBoothTitle(eventName)} photo`}
                      />
                    </div>

                    <fieldset>
                      <legend className="text-sm font-semibold text-secondary">
                        Choose your frame
                      </legend>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {PHOTO_BOOTH_FRAMES.map((option, index) => (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={frame === option.id}
                            onClick={() => setFrame(option.id)}
                            className={`min-h-16 rounded-2xl border p-2 text-left transition ${
                              frame === option.id
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-secondary hover:bg-muted/50"
                            }`}
                          >
                            <span
                              className="mb-1 block h-2.5 w-full rounded-full"
                              style={{ backgroundColor: palette[index] ?? FALLBACK_PALETTE[index] }}
                              aria-hidden
                            />
                            <span className="block text-xs font-semibold">{option.name}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="festive"
                        className="min-h-11 flex-1"
                        disabled={busy}
                        onClick={() => void savePhoto()}
                      >
                        {typeof navigator !== "undefined" && "share" in navigator ? (
                          <Share2 className="h-4 w-4" aria-hidden />
                        ) : (
                          <Download className="h-4 w-4" aria-hidden />
                        )}
                        {busy ? "Preparing…" : "Save to phone"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={reset}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        Try another
                      </Button>
                    </div>
                  </>
                )}

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex items-start gap-2 rounded-2xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p>
                    No app or account needed. Your original and finished photo stay on this device;
                    Confetti never uploads or stores them.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5 text-primary" aria-hidden />
            No upload. No account. No photo storage.
          </div>
        </div>
      </div>
    </section>
  );
}
