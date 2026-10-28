-- NASHRA 015 — Fondations des forfaits et des quotas (migration additive).
-- Prérequis : 006_billing_ops.sql, 009_subscription_limits.sql et 014_billing_subscriptions.sql.
-- NE MODIFIE PAS les routes Telegram, les plafonds techniques 100/300/500,
-- les abonnements actuels ou le comportement des paiements Stripe.
-- Avant toute execution en production : effectuer une sauvegarde Supabase.

BEGIN;

DO $check$
BEGIN
  IF to_regclass('public.nashra_subscriptions') IS NULL
     OR to_regclass('public.nashra_entitlements') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_015: appliquer les migrations 006, 009 et 014 avant 015';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nashra_subscriptions'
      AND column_name = 'stripe_livemode'
  ) THEN
    RAISE EXCEPTION 'NASHRA_015: la migration 014_billing_subscriptions.sql manque';
  END IF;
END;
$check$;

-- 1) Catalogue tarifaire modifiable en base, sans droits d'ecriture client.
CREATE TABLE IF NOT EXISTS public.nashra_plans (
  slug text PRIMARY KEY CHECK (slug IN ('free', 'pro', 'business')),
  display_order integer NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  monthly_price_usd_cents integer NOT NULL CHECK (monthly_price_usd_cents >= 0),
  annual_price_usd_cents integer NOT NULL CHECK (annual_price_usd_cents >= 0),
  max_telegram_accounts integer NOT NULL CHECK (max_telegram_accounts > 0),
  max_active_groups integer NOT NULL CHECK (max_active_groups > 0),
  max_monthly_sends integer NOT NULL CHECK (max_monthly_sends > 0),
  max_pending_schedules integer NOT NULL CHECK (max_pending_schedules > 0),
  priority_support boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Au premier deploiement uniquement : n'ecrase pas les tarifs personnalises
-- d'une reexecution ulterieure.
INSERT INTO public.nashra_plans (
  slug, display_order, monthly_price_usd_cents, annual_price_usd_cents,
  max_telegram_accounts, max_active_groups, max_monthly_sends,
  max_pending_schedules, priority_support
) VALUES
  ('free', 0, 0, 0, 1, 3, 30, 5, false),
  ('pro', 1, 800, 8000, 1, 30, 1000, 150, false),
  ('business', 2, 1900, 19000, 3, 100, 5000, 300, true)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.nashra_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nashra_plans TO anon, authenticated;
DROP POLICY IF EXISTS nashra_plans_public_read ON public.nashra_plans;
CREATE POLICY nashra_plans_public_read ON public.nashra_plans
  FOR SELECT TO anon, authenticated USING (is_active);

-- 2) Champs neutres AJOUTES a la table historique Stripe, sans suppression.
ALTER TABLE public.nashra_subscriptions
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_slug text,
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS provider_livemode boolean,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;

-- Les abonnements deja enregistres restent intacts ; leurs identifiants
-- historiques sont recopies uniquement quand les colonnes neutres sont vides.
UPDATE public.nashra_subscriptions
SET provider = COALESCE(provider, 'stripe'),
    provider_customer_id = COALESCE(provider_customer_id, stripe_customer_id),
    provider_subscription_id = COALESCE(provider_subscription_id, stripe_subscription_id),
    provider_livemode = COALESCE(provider_livemode, stripe_livemode)
WHERE provider IS NULL OR provider_customer_id IS NULL
   OR provider_subscription_id IS NULL OR provider_livemode IS NULL;

ALTER TABLE public.nashra_subscriptions
  ALTER COLUMN provider SET DEFAULT 'stripe';

-- Les nouveaux champs restent facultatifs : l'ancien webhook 014 continue
-- de fonctionner. Une adaptation serveur les alimentera a l'etape 4.
CREATE UNIQUE INDEX IF NOT EXISTS nashra_sub_provider_subscription_unique
  ON public.nashra_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nashra_sub_plan_slug_check'
      AND conrelid = 'public.nashra_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.nashra_subscriptions
      ADD CONSTRAINT nashra_sub_plan_slug_check
      CHECK (plan_slug IS NULL OR plan_slug IN ('free','pro','business'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nashra_sub_billing_interval_check'
      AND conrelid = 'public.nashra_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.nashra_subscriptions
      ADD CONSTRAINT nashra_sub_billing_interval_check
      CHECK (billing_interval IS NULL OR billing_interval IN ('month','year'));
  END IF;
END;
$checks$;

-- Maintenir l'acces en lecture seulement aux abonnements de l'utilisateur.
ALTER TABLE public.nashra_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nashra_subscriptions TO authenticated;

-- 3) Journal de webhooks idempotent (en attente de branchement Stripe, etape 4).
-- Pas de corps brut de webhook stocke : limite l'exposition des donnees.
CREATE TABLE IF NOT EXISTS public.nashra_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(provider) BETWEEN 2 AND 32),
  provider_event_id text NOT NULL CHECK (length(provider_event_id) BETWEEN 2 AND 255),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  provider_created_at timestamptz,
  livemode boolean NOT NULL,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS nashra_billing_events_received_idx
  ON public.nashra_billing_events(received_at DESC);
ALTER TABLE public.nashra_billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_billing_events FROM PUBLIC, anon, authenticated;
-- Seul le backend service_role peut ecrire / lire ce journal.

-- 4) Compteur mensuel et journal de reservations, avec cle d'idempotence.
-- Mois civil UTC ; un envoi = une annonce vers UN groupe.
-- allocated_sends comprend les reservations, confirmations et cas incertains.
-- confirmed_sends est un sous-ensemble d'allocated_sends, PAS une addition.
CREATE TABLE IF NOT EXISTS public.nashra_usage_monthly (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_month date NOT NULL,
  allocated_sends integer NOT NULL DEFAULT 0 CHECK (allocated_sends >= 0),
  confirmed_sends integer NOT NULL DEFAULT 0 CHECK (confirmed_sends >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_month),
  CONSTRAINT nashra_usage_confirmed_below_allocated
    CHECK (confirmed_sends <= allocated_sends),
  CONSTRAINT nashra_usage_month_first_day
    CHECK (extract(day from usage_month) = 1)
);
ALTER TABLE public.nashra_usage_monthly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_usage_monthly FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nashra_usage_monthly TO authenticated;
DROP POLICY IF EXISTS nashra_usage_monthly_read_own ON public.nashra_usage_monthly;
CREATE POLICY nashra_usage_monthly_read_own ON public.nashra_usage_monthly
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.nashra_send_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  announcement_id text NOT NULL CHECK (length(announcement_id) BETWEEN 1 AND 255),
  destination_id text NOT NULL CHECK (length(destination_id) BETWEEN 1 AND 255),
  scheduled_at timestamptz NOT NULL,
  usage_month date NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','confirmed','uncertain','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (user_id, usage_month)
    REFERENCES public.nashra_usage_monthly(user_id, usage_month)
);
CREATE INDEX IF NOT EXISTS nashra_send_reservations_month_idx
  ON public.nashra_send_reservations(user_id, usage_month, status);
ALTER TABLE public.nashra_send_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nashra_send_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nashra_send_reservations TO authenticated;
DROP POLICY IF EXISTS nashra_send_reservations_read_own ON public.nashra_send_reservations;
CREATE POLICY nashra_send_reservations_read_own ON public.nashra_send_reservations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 5) UNIQUE source serveur des droits effectifs pour les prochaines routes.
-- Un ancien droit 'pro' en cache n'autorise pas Pro sans abonnement VALIDE.
-- Un webhook manque ne prolonge pas la date de fin.
CREATE OR REPLACE FUNCTION public.nashra_effective_plan(p_user_id uuid)
RETURNS TABLE (
  plan_slug text,
  max_telegram_accounts integer,
  max_active_groups integer,
  max_monthly_sends integer,
  max_pending_schedules integer,
  priority_support boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_plan text := 'free';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;

  SELECT CASE
    WHEN s.status IN ('active', 'trialing')
      AND s.current_period_end > now()
      AND COALESCE(s.plan_slug, e.tier) IN ('pro', 'business')
      THEN COALESCE(s.plan_slug, e.tier)
    ELSE 'free'
  END INTO v_plan
  FROM public.nashra_subscriptions s
  LEFT JOIN public.nashra_entitlements e ON e.user_id = s.user_id
  WHERE s.user_id = p_user_id;

  RETURN QUERY
    SELECT p.slug, p.max_telegram_accounts, p.max_active_groups,
           p.max_monthly_sends, p.max_pending_schedules, p.priority_support
    FROM public.nashra_plans p
    WHERE p.slug = COALESCE(
      (SELECT a.slug FROM public.nashra_plans a
       WHERE a.slug = COALESCE(v_plan, 'free') AND a.is_active), 'free'
    );
END;
$fn$;
REVOKE ALL ON FUNCTION public.nashra_effective_plan(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_effective_plan(uuid) TO service_role;

-- 6) Reservation ATOMIQUE d'UN envoi, idempotente par utilisateur et cle.
-- Cette fonction PREPARE l'etape 3. Elle n'est pas encore appelee par les routes.
CREATE OR REPLACE FUNCTION public.nashra_reserve_one_send(
  p_user_id uuid,
  p_idempotency_key text,
  p_announcement_id text,
  p_destination_id text,
  p_scheduled_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_month date;
  v_existing public.nashra_send_reservations%ROWTYPE;
  v_limit integer;
  v_reserved uuid;
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;
  IF p_user_id IS NULL OR p_scheduled_at IS NULL
     OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR p_announcement_id IS NULL OR length(p_announcement_id) NOT BETWEEN 1 AND 255
     OR p_destination_id IS NULL OR length(p_destination_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'NASHRA_INVALID_RESERVATION';
  END IF;

  -- Stabilise les operations concurrentes sur un compte, meme avant l'UPSERT.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text), 4151);
  v_month := pg_catalog.date_trunc('month', p_scheduled_at AT TIME ZONE 'UTC')::date;

  SELECT * INTO v_existing FROM public.nashra_send_reservations r
  WHERE r.user_id = p_user_id AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.announcement_id <> p_announcement_id
       OR v_existing.destination_id <> p_destination_id
       OR v_existing.scheduled_at <> p_scheduled_at THEN
      RAISE EXCEPTION 'NASHRA_IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_existing.status = 'released' THEN
      RAISE EXCEPTION 'NASHRA_RESERVATION_ALREADY_RELEASED';
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT e.max_monthly_sends INTO v_limit
  FROM public.nashra_effective_plan(p_user_id) e;
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'NASHRA_PLAN_NOT_FOUND';
  END IF;

  INSERT INTO public.nashra_usage_monthly (user_id, usage_month)
    VALUES (p_user_id, v_month)
  ON CONFLICT (user_id, usage_month) DO NOTHING;

  UPDATE public.nashra_usage_monthly m
    SET allocated_sends = m.allocated_sends + 1, updated_at = now()
    WHERE m.user_id = p_user_id AND m.usage_month = v_month
      AND m.allocated_sends < v_limit
    RETURNING m.allocated_sends INTO v_count;
  IF v_count IS NULL THEN
    RAISE EXCEPTION 'NASHRA_MONTHLY_SEND_QUOTA_EXCEEDED';
  END IF;

  INSERT INTO public.nashra_send_reservations (
    user_id, idempotency_key, announcement_id, destination_id,
    scheduled_at, usage_month
  ) VALUES (
    p_user_id, p_idempotency_key, p_announcement_id, p_destination_id,
    p_scheduled_at, v_month
  ) RETURNING id INTO v_reserved;
  RETURN v_reserved;
END;
$fn$;
REVOKE ALL ON FUNCTION public.nashra_reserve_one_send(uuid,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_reserve_one_send(uuid,text,text,text,timestamptz)
  TO service_role;

-- 7) Finalisation conservative : pas de double comptage.
-- 'confirmed' exige une preuve suffisante fournie par le code serveur.
-- 'uncertain' reste imputee au quota pour eviter une relance accidentelle.
-- 'released' UNIQUEMENT si aucun envoi n'a pu partir (preuve cote serveur).
CREATE OR REPLACE FUNCTION public.nashra_finalize_one_send(
  p_user_id uuid,
  p_reservation_id uuid,
  p_outcome text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_res public.nashra_send_reservations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NASHRA_BILLING_UNAUTHORIZED';
  END IF;
  IF p_user_id IS NULL OR p_reservation_id IS NULL OR p_outcome IS NULL
     OR p_outcome NOT IN ('confirmed','uncertain','released') THEN
    RAISE EXCEPTION 'NASHRA_INVALID_FINALIZATION';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text), 4151);
  SELECT * INTO v_res FROM public.nashra_send_reservations r
  WHERE r.id = p_reservation_id AND r.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NASHRA_RESERVATION_NOT_FOUND';
  END IF;
  IF v_res.status = p_outcome THEN
    RETURN false; -- Appel rejoue : aucun double comptage.
  END IF;
  IF v_res.status <> 'reserved'
     AND NOT (v_res.status = 'uncertain' AND p_outcome = 'confirmed') THEN
    RAISE EXCEPTION 'NASHRA_RESERVATION_FINALIZED';
  END IF;

  IF p_outcome = 'released' THEN
    UPDATE public.nashra_usage_monthly m
      SET allocated_sends = m.allocated_sends - 1, updated_at = now()
    WHERE m.user_id = p_user_id AND m.usage_month = v_res.usage_month;
  ELSIF p_outcome = 'confirmed' THEN
    UPDATE public.nashra_usage_monthly m
      SET confirmed_sends = m.confirmed_sends + 1, updated_at = now()
    WHERE m.user_id = p_user_id AND m.usage_month = v_res.usage_month;
  END IF;

  UPDATE public.nashra_send_reservations r
    SET status = p_outcome, finalized_at = now()
  WHERE r.id = p_reservation_id;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.nashra_finalize_one_send(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_finalize_one_send(uuid,uuid,text)
  TO service_role;

COMMIT;
