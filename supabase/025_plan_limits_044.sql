-- Nashra 044 — Correctif des plafonds du catalogue (migration additive).
-- Prerequis : SQL 015 (nashra_plans), puis SQL 020 et migrations ulterieures.
-- Exécuter dans le SQL Editor du projet Supabase vise, apres sauvegarde.
-- Ne supprime et ne modifie aucun compte, groupe, envoi ou abonnement.
-- Les gardes SQL deja en place consultent nashra_effective_plan a chaque reservation.
-- Si un utilisateur a plus d'objets actifs que son nouveau plafond, les objets
-- existants restent en place et les nouvelles operations peuvent etre bloquees
-- jusqu'a une reduction manuelle (comportement prevu par SQL 016/020).
BEGIN;

DO $check$
BEGIN
  IF to_regclass('public.nashra_plans') IS NULL
     OR to_regprocedure('public.nashra_effective_plan(uuid)') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_025_REQUIRES_SQL_015';
  END IF;
END
$check$;

-- Ne touche ni aux prix, ni aux abonnements Stripe, ni aux donnees clients.
UPDATE public.nashra_plans
SET max_telegram_accounts = limits.max_telegram_accounts,
    max_active_groups = limits.max_active_groups,
    max_monthly_sends = limits.max_monthly_sends,
    max_pending_schedules = limits.max_pending_schedules,
    updated_at = now()
FROM (VALUES
  ('free',     1,  3,   30,   5),
  ('pro',      1, 30, 1000, 150),
  ('business', 1, 30, 2000, 300)
) AS limits(slug, max_telegram_accounts, max_active_groups, max_monthly_sends, max_pending_schedules)
WHERE public.nashra_plans.slug = limits.slug
  AND (public.nashra_plans.max_telegram_accounts,
       public.nashra_plans.max_active_groups,
       public.nashra_plans.max_monthly_sends,
       public.nashra_plans.max_pending_schedules)
  IS DISTINCT FROM
      (limits.max_telegram_accounts,
       limits.max_active_groups,
       limits.max_monthly_sends,
       limits.max_pending_schedules);

-- Refuser un catalogue incomplet au lieu d'annoncer une migration reussie.
DO $verify$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.nashra_plans p
  JOIN (VALUES
    ('free', 1, 3, 30, 5),
    ('pro', 1, 30, 1000, 150),
    ('business', 1, 30, 2000, 300)
  ) AS v(slug, accounts, groups_limit, sends_limit, pending_limit)
  ON p.slug = v.slug
   AND p.max_telegram_accounts = v.accounts
   AND p.max_active_groups = v.groups_limit
   AND p.max_monthly_sends = v.sends_limit
   AND p.max_pending_schedules = v.pending_limit;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'NASHRA_025_PLAN_CATALOG_MISMATCH';
  END IF;
END $verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Controle de lecture APRES COMMIT (SQL Editor) :
-- SELECT slug, max_telegram_accounts, max_active_groups,
--        max_monthly_sends, max_pending_schedules
-- FROM public.nashra_plans ORDER BY display_order;
