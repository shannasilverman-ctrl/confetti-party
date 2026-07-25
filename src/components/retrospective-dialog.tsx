// Post-event retrospective: what worked, what ran out, what to change.
// Host-only — persists via existing RLS on parties.retrospective.

import { useState } from "react";
import { toast } from "sonner";
import { NotebookPen } from "lucide-react";
import { useParties, type PartyRetrospective } from "@/lib/party-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function RetrospectiveDialog({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const existing = party.retrospective ?? null;

  const [open, setOpen] = useState(false);
  const [worked, setWorked] = useState(existing?.worked ?? "");
  const [ranOut, setRanOut] = useState(existing?.ranOut ?? "");
  const [changeNext, setChangeNext] = useState(existing?.changeNext ?? "");

  function save() {
    const next: PartyRetrospective = {
      updatedAt: new Date().toISOString(),
      worked: worked.trim() || undefined,
      ranOut: ranOut.trim() || undefined,
      changeNext: changeNext.trim() || undefined,
    };
    updateParty(party.id, (p) => ({ ...p, retrospective: next }));
    toast.success("Saved — you'll see these next time you clone this party.");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <NotebookPen className="h-4 w-4" />
          {existing ? "Edit retrospective" : "Add retrospective"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How did it go?</DialogTitle>
          <DialogDescription>
            Only you can see this. Next time you clone this party we'll surface these notes as suggested improvements.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="retro-worked">What worked</Label>
            <Textarea
              id="retro-worked"
              value={worked}
              onChange={(e) => setWorked(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="The taco bar was a hit; playlist was perfect."
            />
          </div>
          <div>
            <Label htmlFor="retro-ran-out">What ran out or fell short</Label>
            <Textarea
              id="retro-ran-out"
              value={ranOut}
              onChange={(e) => setRanOut(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ran out of ice by 8pm; needed one more dessert."
            />
          </div>
          <div>
            <Label htmlFor="retro-change">What to change next time</Label>
            <Textarea
              id="retro-change"
              value={changeNext}
              onChange={(e) => setChangeNext(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Double the ice, start setup 30 min earlier."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="festive" onClick={save}>Save retrospective</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
