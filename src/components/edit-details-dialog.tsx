import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  planningDetailIsOpen,
  resolvePlanningDetails,
  useParties,
  newId,
  type PlanningDetail,
} from "@/lib/party-context";
import {
  reconcilePartyPlaybook,
  type HostEffort,
  type PartyFormat,
} from "@/lib/party-intelligence";
import { Pencil } from "lucide-react";

const HOST_NOTE_MAX = 280;

export function EditDetailsDialog({
  partyId,
  triggerLabel = "Edit details",
  initialField,
}: {
  partyId: string;
  triggerLabel?: string;
  initialField?: Exclude<PlanningDetail, "theme">;
}) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [guestEstimate, setGuestEstimate] = useState("");
  const [budget, setBudget] = useState("");
  const [hostNote, setHostNote] = useState("");
  const [honoreeAge, setHonoreeAge] = useState("");
  const [expectedKids, setExpectedKids] = useState("");
  const [expectedAdults, setExpectedAdults] = useState("");
  const [effort, setEffort] = useState<HostEffort>("balanced");
  const [partyFormat, setPartyFormat] = useState<PartyFormat>("help-me-choose");

  useEffect(() => {
    if (!open || !party) return;
    setName(party.name);
    setDate(planningDetailIsOpen(party, "date") ? "" : party.date);
    setStartTime(party.startTime ?? "");
    setLocation(party.location ?? "");
    setGuestEstimate(planningDetailIsOpen(party, "guests") ? "" : String(party.guestEstimate));
    setBudget(planningDetailIsOpen(party, "budget") ? "" : String(party.budget));
    setHostNote(party.hostNote ?? "");
    setHonoreeAge(
      party.planningProfile?.honoreeAge != null ? String(party.planningProfile.honoreeAge) : "",
    );
    setExpectedKids(
      party.planningProfile?.expectedKids != null ? String(party.planningProfile.expectedKids) : "",
    );
    setExpectedAdults(
      party.planningProfile?.expectedAdults != null
        ? String(party.planningProfile.expectedAdults)
        : "",
    );
    setEffort(party.planningProfile?.effort ?? "balanced");
    setPartyFormat(party.planningProfile?.format ?? "help-me-choose");
  }, [open, party]);

  if (!party) return null;

  const save = () => {
    if (!name.trim()) return;
    updateParty(partyId, (p) => {
      const details = [
        ...(date ? (["date"] as const) : []),
        ...(guestEstimate ? (["guests"] as const) : []),
        ...(budget ? (["budget"] as const) : []),
      ];
      let next = resolvePlanningDetails(
        {
          ...p,
          name: name.trim(),
          date: date || p.date,
          startTime: startTime.trim() || undefined,
          location: location.trim() || undefined,
          guestEstimate: guestEstimate ? Number(guestEstimate) : p.guestEstimate,
          budget: budget ? Number(budget) : p.budget,
          hostNote: hostNote.trim() ? hostNote.trim().slice(0, HOST_NOTE_MAX) : undefined,
        },
        details,
      );
      if (p.occasion === "birthday") {
        const profile = {
          version: 1 as const,
          ...(Number(honoreeAge) > 0 ? { honoreeAge: Number(honoreeAge) } : {}),
          ...(expectedKids !== "" ? { expectedKids: Number(expectedKids) || 0 } : {}),
          ...(expectedAdults !== "" ? { expectedAdults: Number(expectedAdults) || 0 } : {}),
          effort,
          format: partyFormat,
        };
        next = reconcilePartyPlaybook(next, profile, () => newId());
        const audienceTotal = (profile.expectedKids ?? 0) + (profile.expectedAdults ?? 0);
        if (audienceTotal > 0) next = { ...next, guestEstimate: audienceTotal };
      }
      return next;
    });
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11"
        data-testid={
          initialField
            ? `edit-details-${initialField}-trigger`
            : triggerLabel === "Edit details"
              ? "edit-details-trigger"
              : undefined
        }
        onClick={() => setOpen(true)}
      >
        <Pencil /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-secondary">
              Edit party details
            </DialogTitle>
            <DialogDescription>
              Time and location are optional. Leave blank to hide them from the invite.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ed-name">Party name</Label>
              <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-date">Date</Label>
              <Input
                id="ed-date"
                type="date"
                autoFocus={initialField === "date"}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ed-time">Start time (optional)</Label>
                <Input
                  id="ed-time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="e.g. 2:00 PM"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-location">Location (optional)</Label>
                <Input
                  id="ed-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Our backyard"
                />
              </div>
            </div>
            {party.occasion === "birthday" && (
              <section
                aria-labelledby="edit-birthday-intelligence"
                className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-4"
              >
                <h3
                  id="edit-birthday-intelligence"
                  className="text-sm font-semibold text-secondary"
                >
                  Details that change Confetti&apos;s plan
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Update these and Confetti refreshes only its recommendations. Your own tasks stay
                  untouched.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-age">Turning</Label>
                    <Input
                      id="ed-age"
                      type="number"
                      min={1}
                      max={120}
                      value={honoreeAge}
                      onChange={(event) => setHonoreeAge(event.target.value)}
                      placeholder="Age"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-kids">Children</Label>
                    <Input
                      id="ed-kids"
                      type="number"
                      min={0}
                      value={expectedKids}
                      onChange={(event) => setExpectedKids(event.target.value)}
                      placeholder="?"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-adults">Adults</Label>
                    <Input
                      id="ed-adults"
                      type="number"
                      min={0}
                      value={expectedAdults}
                      onChange={(event) => setExpectedAdults(event.target.value)}
                      placeholder="?"
                    />
                  </div>
                </div>
                <fieldset className="mt-3">
                  <legend className="text-xs font-medium text-secondary">Party format</legend>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[
                      ["help-me-choose", "Help me choose"],
                      ["home", "Home"],
                      ["venue", "Venue"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={partyFormat === value}
                        onClick={() => setPartyFormat(value as PartyFormat)}
                        className={`min-h-11 rounded-full border px-3 py-1.5 text-xs ${
                          partyFormat === value
                            ? "border-primary bg-primary/10 font-medium text-secondary"
                            : "border-border bg-background text-secondary"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mt-3">
                  <legend className="text-xs font-medium text-secondary">Host effort</legend>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {[
                      ["easy", "Make it easy"],
                      ["balanced", "Balanced"],
                      ["all-out", "All out"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={effort === value}
                        onClick={() => setEffort(value as HostEffort)}
                        className={`min-h-11 rounded-xl border px-2 py-1.5 text-xs ${
                          effort === value
                            ? "border-primary bg-primary/10 font-medium text-secondary"
                            : "border-border bg-background text-secondary"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </section>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ed-guests">Guest estimate (optional)</Label>
                <Input
                  id="ed-guests"
                  type="number"
                  min={1}
                  autoFocus={initialField === "guests"}
                  value={guestEstimate}
                  onChange={(e) => setGuestEstimate(e.target.value)}
                  placeholder="Decide later"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-budget">Budget (optional)</Label>
                <Input
                  id="ed-budget"
                  type="number"
                  min={0}
                  autoFocus={initialField === "budget"}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Decide later"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-host-note">Note to your guests (optional)</Label>
              <Textarea
                id="ed-host-note"
                value={hostNote}
                onChange={(e) => setHostNote(e.target.value.slice(0, HOST_NOTE_MAX))}
                maxLength={HOST_NOTE_MAX}
                rows={3}
                placeholder="Parking tips, what to bring, the vibe…"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Shown on your RSVP page — parking tips, what to bring, the vibe.</span>
                <span className="tabular-nums">
                  {hostNote.length}/{HOST_NOTE_MAX}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="festive" onClick={save} disabled={!name.trim()}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
