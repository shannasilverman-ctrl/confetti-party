-- Gathering drafts: structured party draft assembled during a Talk session
CREATE TABLE public.gathering_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ready-for-review','confirmed','abandoned')),
  confirmed_party_id uuid,
  transcript_retention text NOT NULL DEFAULT 'summary' CHECK (transcript_retention IN ('none','summary','full')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gathering_drafts TO authenticated;
GRANT ALL ON public.gathering_drafts TO service_role;

ALTER TABLE public.gathering_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own gathering drafts"
  ON public.gathering_drafts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_gathering_drafts_updated_at
  BEFORE UPDATE ON public.gathering_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX gathering_drafts_user_id_idx ON public.gathering_drafts(user_id);

-- Talk sessions: audit + cost tracking per Realtime session
CREATE TABLE public.talk_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id uuid REFERENCES public.gathering_drafts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_s integer,
  model text,
  tokens_input integer DEFAULT 0,
  tokens_output integer DEFAULT 0,
  audio_seconds_in integer DEFAULT 0,
  audio_seconds_out integer DEFAULT 0,
  cost_cents integer DEFAULT 0,
  disconnect_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talk_sessions TO authenticated;
GRANT ALL ON public.talk_sessions TO service_role;

ALTER TABLE public.talk_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own talk sessions"
  ON public.talk_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own talk sessions"
  ON public.talk_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own talk sessions"
  ON public.talk_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX talk_sessions_user_started_idx ON public.talk_sessions(user_id, started_at DESC);

-- Optional full transcripts (only when retention = 'full')
CREATE TABLE public.talk_transcripts (
  session_id uuid PRIMARY KEY REFERENCES public.talk_sessions(id) ON DELETE CASCADE,
  draft_id uuid REFERENCES public.gathering_drafts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.talk_transcripts TO authenticated;
GRANT ALL ON public.talk_transcripts TO service_role;

ALTER TABLE public.talk_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own transcripts"
  ON public.talk_transcripts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
