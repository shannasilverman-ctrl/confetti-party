import { useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  installPromptIsCoolingDown,
  isIosDevice,
  isStandaloneApp,
  rememberInstallPromptDismissal,
  type BeforeInstallPromptEvent,
  type NavigatorWithStandalone,
} from "@/lib/install-app";

export function InstallAppPrompt({ hidden = false }: { hidden?: boolean }) {
  const [nativePrompt, setNativePrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [iosInstructionsOpen, setIosInstructionsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (
      isStandaloneApp(window, navigator as NavigatorWithStandalone) ||
      installPromptIsCoolingDown(window.localStorage)
    ) {
      return;
    }

    if (isIosDevice(navigator)) setEligible(true);

    const onBeforeInstallPrompt = (rawEvent: Event) => {
      const event = rawEvent as BeforeInstallPromptEvent;
      event.preventDefault();
      setNativePrompt(event);
      setEligible(true);
    };
    const onInstalled = () => {
      setEligible(false);
      setNativePrompt(null);
      setStatus("Confetti was added to this device.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    rememberInstallPromptDismissal(window.localStorage);
    setEligible(false);
    setNativePrompt(null);
  }

  async function install() {
    if (!nativePrompt) {
      setIosInstructionsOpen(true);
      return;
    }

    setInstalling(true);
    setStatus("");
    try {
      await nativePrompt.prompt();
      const choice = await nativePrompt.userChoice;
      if (choice.outcome === "accepted") {
        setEligible(false);
        setNativePrompt(null);
        setStatus("Confetti is being added to this device.");
      } else {
        dismiss();
      }
    } catch {
      setStatus("Your browser couldn't open the install prompt. You can keep planning here.");
    } finally {
      setInstalling(false);
    }
  }

  if (!eligible || hidden) {
    return (
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    );
  }

  return (
    <>
      <section
        aria-label="Install Confetti"
        className="relative mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 pr-12 sm:flex sm:items-center sm:gap-4 sm:pr-12"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-secondary">
              Keep Confetti one tap away
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Add it to your home screen for quick party check-ins.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="festive"
          className="mt-3 w-full sm:mt-0 sm:w-auto"
          disabled={installing}
          onClick={() => void install()}
        >
          <Download className="h-4 w-4" />
          {installing ? "Opening…" : nativePrompt ? "Install Confetti" : "How to install"}
        </Button>
        <button
          type="button"
          aria-label="Not now"
          onClick={dismiss}
          className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
      </section>

      <Dialog open={iosInstructionsOpen} onOpenChange={setIosInstructionsOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-secondary">
              Add Confetti to your Home Screen
            </DialogTitle>
            <DialogDescription>
              Keep your party plan beside the apps you use every day.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm text-secondary">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                1
              </span>
              <span className="pt-1">
                Tap <Share className="mx-1 inline h-4 w-4 text-primary" aria-hidden /> Share in your
                browser.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                2
              </span>
              <span className="pt-1">Choose “Add to Home Screen,” then confirm.</span>
            </li>
          </ol>
          <DialogFooter>
            <Button type="button" variant="festive" onClick={() => setIosInstructionsOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
