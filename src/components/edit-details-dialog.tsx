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
import { useParties } from "@/lib/party-context";
import { Pencil } from "lucide-react";

export function EditDetailsDialog({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    if (!open || !party) return;
    setName(party.name);
    setDate(party.date);
    setStartTime(party.startTime ?? "");
    setLocation(party.location ?? "");
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
