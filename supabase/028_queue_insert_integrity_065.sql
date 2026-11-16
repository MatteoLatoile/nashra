-- Nashra 065: preserve delivery_queue system-managed fields on client INSERT.
-- Requires 004, 005, 007, 008/009, 024 and 027. No jobs updated or sent.
-- The authenticated /api/automation/queue prepare flow inserts 'held' with basic fields.
-- Service-role insertions (manual claims/native scheduling/recurrences) are unchanged.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.delivery_queue') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_065: delivery_queue missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.delivery_queue'::regclass
      AND tgname = 'nashra_v32_queue_insert' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'NASHRA_065: existing insert quota guard missing; abort';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.delivery_queue'::regclass
      AND tgname = 'nashra_v31_queue_transition' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'NASHRA_065: update transition guard missing; abort';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nashra_065_client_insert_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.status IS DISTINCT FROM 'held' THEN
      RAISE EXCEPTION 'NASHRA_065: invalid owner or initial queue status';
    END IF;
    -- These are evidence / result fields. Only server-side actions may set them.
    IF NEW.attempted_at IS NOT NULL OR NEW.finished_at IS NOT NULL
      OR NEW.telegram_message_id IS NOT NULL OR NEW.last_error IS NOT NULL
      OR COALESCE(cardinality(NEW.telegram_scheduled_ids), 0) <> 0 THEN
      RAISE EXCEPTION 'NASHRA_065: server-only delivery metadata on insert';
    END IF;
    -- Ignore client-supplied audit timestamps and IDs for newly created rows.
    NEW.created_at := statement_timestamp();
    NEW.updated_at := NEW.created_at;
    NEW.id := gen_random_uuid();
  ELSIF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_065: queue insertion role not permitted';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nashra_065_client_insert_integrity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS nashra_065_client_insert_integrity ON public.delivery_queue;
CREATE TRIGGER nashra_065_client_insert_integrity
  BEFORE INSERT ON public.delivery_queue
  FOR EACH ROW EXECUTE FUNCTION public.nashra_065_client_insert_integrity();
COMMIT;
