-- NASHRA 023 — Apply ONLY AFTER the corresponding Next.js server code
-- (adminDb()-based Telegram account operations) is deployed and verified.
-- Restricts client-facing direct writes. Does not delete any data.
-- SELECT deliberately retained because diagnostics and other routes may still
-- use the authenticated Supabase client to check connection status.
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.telegram_accounts FROM authenticated, anon;
COMMIT;
