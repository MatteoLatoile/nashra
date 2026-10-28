-- Nashra 018. Execute AFTER 015, 016, 017 and 013. Back up your database first.
-- A recurrent campaign is server-owned; the client can only READ its rule.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.delivery_queue') IS NULL OR
     to_regclass('public.nashra_send_reservations') IS NULL OR
     to_regclass('public.workspaces') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_018_REQUIRES_013_015_016';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.nashra_recurring_rules (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id text NOT NULL,
  destination_ids text[] NOT NULL,
  anchor_at timestamptz NOT NULL,
  interval_days integer NOT NULL CHECK (interval_days BETWEEN 1 AND 30),
  time_zone text NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 80),
  until_day date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  last_problem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nashra_018_destination_size CHECK (cardinality(destination_ids) BETWEEN 1 AND 10)
);
CREATE INDEX IF NOT EXISTS nashra_recurring_active_idx
  ON public.nashra_recurring_rules (status, updated_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS nashra_recurring_user_idx ON public.nashra_recurring_rules (user_id);
ALTER TABLE public.nashra_recurring_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_recurring_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nashra_recurring_rules TO authenticated;
GRANT ALL ON public.nashra_recurring_rules TO service_role;
DROP POLICY IF EXISTS nashra_recurring_read_own ON public.nashra_recurring_rules;
CREATE POLICY nashra_recurring_read_own ON public.nashra_recurring_rules
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
COMMIT;
