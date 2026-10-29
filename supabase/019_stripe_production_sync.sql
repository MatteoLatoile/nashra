-- Nashra 019 — Stripe production / test: atomic event ledger + subscription + entitlements.
-- Apply AFTER 006, 009, 014, 015 and 016; BACK UP Supabase beforehand.
-- Does not enable charges. Only signed Stripe events, handled by the backend service_role,
-- may invoke this function. Repeated or out-of-order events cannot grant stale rights.
BEGIN;
DO $check$
BEGIN
  IF to_regclass('public.nashra_billing_events') IS NULL
     OR to_regclass('public.nashra_plans') IS NULL
     OR to_regclass('public.nashra_subscriptions') IS NULL
     OR to_regclass('public.nashra_entitlements') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_019_REQUIRES_014_AND_015';
  END IF;
END $check$;

CREATE OR REPLACE FUNCTION public.nashra_billing_ready_v2()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.nashra_billing_ready_v2() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_billing_ready_v2() TO service_role;

CREATE OR REPLACE FUNCTION public.nashra_apply_subscription_event_v2(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_created bigint,
  p_price_id text,
  p_status text,
  p_livemode boolean,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_tier text,
  p_interval text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_new_event uuid;
  v_updated uuid;
  v_effective_tier text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;
  IF p_user_id IS NULL
    OR p_event_id !~ '^evt_[A-Za-z0-9]+$'
    OR p_event_type NOT IN (
      'customer.subscription.created','customer.subscription.updated',
      'customer.subscription.deleted','customer.subscription.paused',
      'customer.subscription.resumed','customer.subscription.pending_update_applied',
      'checkout.session.completed','checkout.session.async_payment_succeeded',
      'invoice.paid','invoice.payment_failed'
    )
    OR p_customer_id !~ '^cus_[A-Za-z0-9]+$'
    OR p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    OR p_status NOT IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    OR p_tier NOT IN ('free','pro','business')
    OR (p_interval IS NOT NULL AND p_interval NOT IN ('month','year'))
    OR p_event_created <= 0 OR p_subscription_created <= 0
    OR (p_status NOT IN ('active','trialing') AND p_tier <> 'free')
    OR (p_tier <> 'free' AND (p_price_id IS NULL OR p_period_end IS NULL))
    OR (p_period_start IS NOT NULL AND p_period_end IS NOT NULL AND p_period_start >= p_period_end)
  THEN RAISE EXCEPTION 'NASHRA_BILLING_INVALID_EVENT'; END IF;

  -- Serialize events per user and atomically avoid duplicates on the Stripe event ID.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text), 4151);
  INSERT INTO public.nashra_billing_events (
    provider, provider_event_id, user_id, event_type,
    provider_created_at, livemode, processing_status
  ) VALUES (
    'stripe', p_event_id, p_user_id, p_event_type,
    pg_catalog.to_timestamp(p_event_created), p_livemode, 'received'
  ) ON CONFLICT (provider,provider_event_id) DO NOTHING
  RETURNING id INTO v_new_event;
  IF v_new_event IS NULL THEN RETURN false; END IF;

  -- Commercial plan is free unless subscription is active and inside its paid period.
  v_effective_tier := CASE
    WHEN p_status IN ('active','trialing') AND p_period_end > now()
      THEN p_tier ELSE 'free' END;

  INSERT INTO public.nashra_subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, price_id, status,
    stripe_livemode, stripe_subscription_created_at, current_period_end,
    cancel_at_period_end, last_event_created, updated_at,
    provider, provider_customer_id, provider_subscription_id, provider_livemode,
    plan_slug, billing_interval, current_period_start, last_reconciled_at
  ) VALUES (
    p_user_id, p_customer_id, p_subscription_id, p_price_id, p_status,
    p_livemode, p_subscription_created, p_period_end,
    p_cancel_at_period_end, p_event_created, now(),
    'stripe', p_customer_id, p_subscription_id, p_livemode,
    v_effective_tier, p_interval, p_period_start, now()
  ) ON CONFLICT (user_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    price_id = EXCLUDED.price_id,
    status = EXCLUDED.status,
    stripe_livemode = EXCLUDED.stripe_livemode,
    stripe_subscription_created_at = EXCLUDED.stripe_subscription_created_at,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    last_event_created = EXCLUDED.last_event_created,
    updated_at = EXCLUDED.updated_at,
    provider = EXCLUDED.provider,
    provider_customer_id = EXCLUDED.provider_customer_id,
    provider_subscription_id = EXCLUDED.provider_subscription_id,
    provider_livemode = EXCLUDED.provider_livemode,
    plan_slug = EXCLUDED.plan_slug,
    billing_interval = EXCLUDED.billing_interval,
    current_period_start = EXCLUDED.current_period_start,
    last_reconciled_at = EXCLUDED.last_reconciled_at
  WHERE EXCLUDED.stripe_subscription_created_at > public.nashra_subscriptions.stripe_subscription_created_at
    OR (EXCLUDED.stripe_subscription_id = public.nashra_subscriptions.stripe_subscription_id
        AND EXCLUDED.last_event_created >= public.nashra_subscriptions.last_event_created)
  RETURNING user_id INTO v_updated;

  IF v_updated IS NOT NULL THEN
    INSERT INTO public.nashra_entitlements(user_id,tier,updated_at)
      VALUES (p_user_id,v_effective_tier,now())
    ON CONFLICT (user_id) DO UPDATE
      SET tier=EXCLUDED.tier,updated_at=EXCLUDED.updated_at;
  END IF;

  UPDATE public.nashra_billing_events
    SET processing_status = CASE WHEN v_updated IS NULL THEN 'ignored' ELSE 'processed' END,
        processed_at = now()
  WHERE id = v_new_event;
  RETURN v_updated IS NOT NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nashra_apply_subscription_event_v2(
  text,text,bigint,uuid,text,text,bigint,text,text,boolean,
  timestamptz,timestamptz,boolean,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_apply_subscription_event_v2(
  text,text,bigint,uuid,text,text,bigint,text,text,boolean,
  timestamptz,timestamptz,boolean,text,text
) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
