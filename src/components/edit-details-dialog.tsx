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
import { useParties } from "@/lib/party-context";
import { Pencil } from "lucide-react";

const HOST_NOTE_MAX = 280;

export function EditDetailsDialog({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [hostNote, setHostNote] = useState("");

  useEffect(() => {
    if (!open || !party) return;
    setName(party.name);
    setDate(party.date);
    setStartTime(party.startTime ?? "");
    setLocation(party.location ?? "");
    setHostNote(party.hostNote ?? "");
  }, [open, party]);

  if (!party) return null;

  const save = () => {
    if (!name.trim() || !date) return;
    updateParty(partyId, (p) => ({
      ...p,
      name: name.trim(),
      date,
      startTime: startTime.trim() || undefined,
      location: location.trim() || undefined,
      hostNote: hostNote.trim() ? hostNote.trim().slice(0, HOST_NOTE_MAX) : undefined,
    }));
    setOpen(false);
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> Edit details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
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
              <Input
                id="ed-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-date">Date</Label>
              <Input
                id="ed-date"
                type="date"
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
                <span className="tabular-nums">{hostNote.length}/{HOST_NOTE_MAX}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="festive" onClick={save} disabled={!name.trim() || !date}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

