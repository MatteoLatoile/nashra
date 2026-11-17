-- Nashra 074 — réduction du Free uniquement. SQL 025 reste historique et inchangé.
-- Appliquer UNE fois sur la base de production, après sauvegarde.
-- Aucun envoi Telegram, aucune suppression de ligne, aucun changement des prix.
-- Les objets Free existants au-delà des nouveaux plafonds ne sont pas supprimés :
-- les nouvelles opérations pourront être bloquées jusqu'à réduction des usages.
BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('public.nashra_plans') IS NULL THEN
    RAISE EXCEPTION 'NASHRA_074: nashra_plans absent (SQL 015 requis)';
  END IF;
  IF (SELECT count(*) FROM public.nashra_plans WHERE slug = 'free') <> 1 THEN
    RAISE EXCEPTION 'NASHRA_074: Free absent ou en doublon';
  END IF;
END $preflight$;
UPDATE public.nashra_plans
SET max_telegram_accounts = 1,
    max_active_groups = 2,
    max_monthly_sends = 10,
    max_pending_schedules = 3,
    updated_at = now()
WHERE slug = 'free'
  AND (max_telegram_accounts, max_active_groups, max_monthly_sends, max_pending_schedules)
      IS DISTINCT FROM (1, 2, 10, 3);
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.nashra_plans
    WHERE slug = 'free'
      AND max_telegram_accounts = 1
      AND max_active_groups = 2
      AND max_monthly_sends = 10
      AND max_pending_schedules = 3
  ) THEN
    RAISE EXCEPTION 'NASHRA_074: quotas Free non appliqués';
  END IF;
END $verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;
