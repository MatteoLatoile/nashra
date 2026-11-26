-- Nashra transactional-email outbox; run once in Supabase SQL Editor.
-- No changes to existing billing or Telegram tables.
CREATE TABLE IF NOT EXISTS public.nashra_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('welcome','subscription_activated','payment_failed','telegram_reconnect','campaign_action_needed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 9),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nashra_email_pending_idx ON public.nashra_email_notifications (next_attempt_at,created_at)
  WHERE status IN ('pending','processing');
ALTER TABLE public.nashra_email_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nashra_email_notifications FROM anon, authenticated;
-- Rows can be read/written only using service role (or postgres itself).

-- Atomic claim: concurrent Vercel invocations cannot send the same row concurrently.
CREATE OR REPLACE FUNCTION public.nashra_claim_email_notifications(p_limit integer DEFAULT 8)
RETURNS SETOF public.nashra_email_notifications
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.nashra_email_notifications n
  SET status='processing', claimed_at=now(), attempts=n.attempts+1
  WHERE n.id IN (
    SELECT id FROM public.nashra_email_notifications
    WHERE ((status='pending' AND next_attempt_at <= now())
       OR (status='processing' AND claimed_at < now()-interval '10 minutes' AND created_at>now()-interval '20 hours'))
      AND attempts<3
    ORDER BY next_attempt_at,created_at
    LIMIT LEAST(GREATEST(p_limit,1),10) FOR UPDATE SKIP LOCKED
  ) RETURNING n.*;
$$;
REVOKE ALL ON FUNCTION public.nashra_claim_email_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nashra_claim_email_notifications(integer) TO service_role;

-- Queue a single welcome email when a real account becomes verified.
-- No emails are sent by this trigger; a server-side worker sends the outbox.
CREATE OR REPLACE FUNCTION public.nashra_queue_welcome_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE should_queue boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_queue := NEW.email_confirmed_at IS NOT NULL;
  ELSE
    should_queue := OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL;
  END IF;
  IF should_queue AND NULLIF(NEW.email,'') IS NOT NULL THEN
    INSERT INTO public.nashra_email_notifications(user_id,event_key,kind)
    VALUES (NEW.id,'welcome:'||NEW.id::text,'welcome') ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nashra_auth_welcome_insert ON auth.users;
CREATE TRIGGER nashra_auth_welcome_insert AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.nashra_queue_welcome_email();
DROP TRIGGER IF EXISTS nashra_auth_welcome_confirm ON auth.users;
CREATE TRIGGER nashra_auth_welcome_confirm AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.nashra_queue_welcome_email();
REVOKE ALL ON FUNCTION public.nashra_queue_welcome_email() FROM PUBLIC, anon, authenticated;
