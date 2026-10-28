-- SAFE READ-ONLY verification of SQL 015 + 016. Run after migration 016.
DO $verify$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM public.nashra_plans WHERE slug IN ('free','pro','business');
  IF c <> 3 THEN RAISE EXCEPTION 'NASHRA_016: expected 3 plans, found %',c; END IF;
  SELECT count(*) INTO c FROM pg_trigger
    WHERE tgrelid='public.workspaces'::regclass
      AND tgname='nashra_016_workspace_groups' AND NOT tgisinternal;
  IF c <> 1 THEN RAISE EXCEPTION 'NASHRA_016: groups trigger absent'; END IF;
  SELECT count(*) INTO c FROM pg_trigger
    WHERE tgrelid='public.delivery_queue'::regclass
      AND tgname='nashra_016_queue_pending' AND NOT tgisinternal;
  IF c <> 1 THEN RAISE EXCEPTION 'NASHRA_016: pending trigger absent'; END IF;
  IF to_regprocedure('public.nashra_reserve_send_with_origin(uuid,text,text,text,timestamptz)') IS NULL
     OR to_regprocedure('public.nashra_effective_plan(uuid)') IS NULL
     OR to_regprocedure('public.nashra_finalize_one_send(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_016: required RPC absent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='nashra_send_reservations'
      AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN RAISE EXCEPTION 'NASHRA_016: reservations writable by client'; END IF;
  RAISE NOTICE 'NASHRA_016_OK: plans, SQL functions, triggers, no direct reservation writes';
END;
$verify$;
SELECT slug,monthly_price_usd_cents,annual_price_usd_cents,
  max_telegram_accounts,max_active_groups,max_monthly_sends,max_pending_schedules
FROM public.nashra_plans ORDER BY display_order;
