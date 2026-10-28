-- Nashra 014: production-safe subscription tracking; no payments enabled here.
-- Apply once after migrations 006 (subscriptions), 009 (entitlements), and 013 (Telegram if installed).
-- This migration does not touch the Telegram publication flow.
DO $$ BEGIN
  IF to_regclass('public.nashra_subscriptions') IS NULL OR to_regclass('public.nashra_entitlements') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_014: apply SQL 006 and 009 first';
  END IF;
END $$;
ALTER TABLE public.nashra_subscriptions ADD COLUMN IF NOT EXISTS stripe_livemode boolean NOT NULL DEFAULT false;
ALTER TABLE public.nashra_subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_created_at bigint NOT NULL DEFAULT 0;

-- Only service_role (after verified Stripe webhook) may change subscriptions or tiers.
CREATE OR REPLACE FUNCTION public.nashra_apply_subscription_event(
  p_user_id uuid, p_customer_id text, p_subscription_id text,
  p_price_id text, p_status text, p_livemode boolean,
  p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_event_created bigint, p_subscription_created bigint, p_tier text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  updated_user uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;
  IF p_user_id IS NULL OR p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     OR p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     OR p_status NOT IN ('free','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
     OR p_tier NOT IN ('free','pro','business')
     OR p_event_created < 0 OR p_subscription_created < 1
     OR (p_status NOT IN ('active','trialing') AND p_tier <> 'free') THEN
     RAISE EXCEPTION 'NASHRA_BILLING_INVALID_EVENT';
  END IF;
  INSERT INTO public.nashra_subscriptions (
    user_id,stripe_customer_id,stripe_subscription_id,price_id,status,
    stripe_livemode,stripe_subscription_created_at,
    current_period_end,cancel_at_period_end,last_event_created,updated_at
  ) VALUES (
    p_user_id,p_customer_id,p_subscription_id,p_price_id,p_status,
    p_livemode,p_subscription_created,
    p_period_end,p_cancel_at_period_end,p_event_created,now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    price_id = EXCLUDED.price_id,
    status = EXCLUDED.status,
    stripe_livemode = EXCLUDED.stripe_livemode,
    stripe_subscription_created_at = EXCLUDED.stripe_subscription_created_at,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    last_event_created = EXCLUDED.last_event_created,
    updated_at = EXCLUDED.updated_at
  -- An event for an older subscription must never downgrade a newer one.
  WHERE EXCLUDED.stripe_subscription_created_at > public.nashra_subscriptions.stripe_subscription_created_at
    OR (EXCLUDED.stripe_subscription_id = public.nashra_subscriptions.stripe_subscription_id
        AND EXCLUDED.last_event_created >= public.nashra_subscriptions.last_event_created)
  RETURNING user_id INTO updated_user;
  IF updated_user IS NULL THEN RETURN false; END IF;
  INSERT INTO public.nashra_entitlements(user_id,tier,updated_at)
    VALUES (p_user_id,p_tier,now())
    ON CONFLICT (user_id) DO UPDATE SET tier=EXCLUDED.tier,updated_at=EXCLUDED.updated_at;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.nashra_apply_subscription_event(
  uuid,text,text,text,text,boolean,timestamptz,boolean,bigint,bigint,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_apply_subscription_event(
  uuid,text,text,text,text,boolean,timestamptz,boolean,bigint,bigint,text
) TO service_role;
