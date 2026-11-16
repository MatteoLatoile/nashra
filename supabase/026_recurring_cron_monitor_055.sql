-- Nashra 055: private, minimal history of recurring Cron invocations.
-- Apply after migration 011. Never stores chat IDs, tokens, sessions or messages.
CREATE TABLE IF NOT EXISTS public.nashra_recurring_cron_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 3600000),
  outcome text NOT NULL CHECK (outcome IN ('done','disabled','error')),
  rules_checked integer NOT NULL DEFAULT 0 CHECK (rules_checked BETWEEN 0 AND 1000000),
  scheduled_count integer NOT NULL DEFAULT 0 CHECK (scheduled_count BETWEEN 0 AND 1000000),
  warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count BETWEEN 0 AND 1000000)
);
CREATE INDEX IF NOT EXISTS nashra_recurring_cron_runs_started_idx
  ON public.nashra_recurring_cron_runs (started_at DESC);
ALTER TABLE public.nashra_recurring_cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nashra_recurring_cron_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.nashra_recurring_cron_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.nashra_recurring_cron_runs_id_seq TO service_role;
-- Only the server's service_role can see or write this log.
-- Retention is applied by the authorized recurring Cron on every regular run (30 days).
