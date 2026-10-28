-- NASHRA V3.5 — METRIQUES DU CRON (aucun message Telegram ni secret stocke)
-- Prerequis: migrations 004 a 010 deja appliquees.
-- Repeter ce script est sans danger pour les donnees existantes.
DO $$ BEGIN
  IF to_regclass('public.delivery_queue') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_011: delivery_queue absente, executer SQL 004.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'delivery_queue' AND column_name = 'attempted_at'
  ) THEN
    RAISE EXCEPTION 'NASHRA_011: attempted_at absente, executer SQL 005 AVANT 011.';
  END IF;
  IF to_regclass('public.nashra_admin_audit') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_011: administration absente, executer SQL 010.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.nashra_worker_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 3600000),
  outcome text NOT NULL CHECK (outcome IN ('idle','disabled','sent','blocked','needs_review','error')),
  stalled_flagged integer NOT NULL DEFAULT 0 CHECK (stalled_flagged >= 0),
  expired_flagged integer NOT NULL DEFAULT 0 CHECK (expired_flagged >= 0)
);
CREATE INDEX IF NOT EXISTS nashra_worker_runs_time_idx
  ON public.nashra_worker_runs (started_at DESC);
ALTER TABLE public.nashra_worker_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_worker_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.nashra_worker_runs TO service_role;
-- Le role service a egalement la capacite de lire les identifiants generes.
GRANT USAGE, SELECT ON SEQUENCE public.nashra_worker_runs_id_seq TO service_role;
-- Aucune policy utilisateur: les metriques restent strictement privees au serveur.

CREATE OR REPLACE FUNCTION public.nashra_v35_prune_worker_runs(p_days integer DEFAULT 45)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_days NOT BETWEEN 7 AND 365 THEN
    RAISE EXCEPTION 'NASHRA_INVALID_RETENTION_DAYS';
  END IF;
  DELETE FROM public.nashra_worker_runs WHERE started_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.nashra_v35_prune_worker_runs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_v35_prune_worker_runs(integer) TO service_role;
