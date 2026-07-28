-- Durable, structured facts that change Confetti's recommendations.
-- Kept separate from host_note so future playbooks can evolve without parsing
-- prose or inventing facts. Existing parties receive an empty profile.
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS planning_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.parties.planning_profile IS
  'Versioned party intelligence inputs such as honoree age, audience split, desired effort, and format.';
