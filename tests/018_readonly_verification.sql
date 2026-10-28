-- Nashra 018 - READ ONLY verification, run in Supabase SQL Editor.
SELECT 'nashra_018_rules_table' AS test, to_regclass('public.nashra_recurring_rules') IS NOT NULL AS ok
UNION ALL
SELECT 'rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid='public.nashra_recurring_rules'::regclass),false)
UNION ALL
SELECT 'auth_cannot_insert', NOT has_table_privilege('authenticated','public.nashra_recurring_rules','INSERT')
UNION ALL
SELECT 'auth_cannot_update', NOT has_table_privilege('authenticated','public.nashra_recurring_rules','UPDATE')
UNION ALL
SELECT 'auth_cannot_delete', NOT has_table_privilege('authenticated','public.nashra_recurring_rules','DELETE')
UNION ALL
SELECT 'auth_can_read', has_table_privilege('authenticated','public.nashra_recurring_rules','SELECT');
