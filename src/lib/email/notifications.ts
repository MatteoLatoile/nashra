/** Nashra transactional notification outbox. Server-only; no user-provided addresses. */
import 'server-only';
import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/nashra-bundle/secure';

export type NotificationKind = 'welcome' | 'subscription_activated' | 'payment_failed' | 'telegram_reconnect' | 'campaign_action_needed';
export type NotificationPayload = { tier?: 'pro'|'business'; campaign?: string; campaignId?: string; jobId?: string; sessionFingerprint?: string };

const kinds = new Set<NotificationKind>(['welcome','subscription_activated','payment_failed','telegram_reconnect','campaign_action_needed']);
export const notificationsEnabled = () => process.env.NASHRA_EMAILS_ENABLED === '1';

export async function queueNotification(userId: string, kind: NotificationKind, eventKey: string, payload: NotificationPayload = {}) {
  if (!notificationsEnabled()) return false;
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !kinds.has(kind) || !eventKey || eventKey.length > 180) throw new Error('Invalid Nashra notification');
  const { error } = await adminDb().from('nashra_email_notifications').upsert({
    user_id:userId, event_key:eventKey, kind, payload,
  }, { onConflict:'event_key', ignoreDuplicates:true });
  if (error) throw new Error('Notification outbox unavailable');
  return true;
}

export function sessionFingerprint(sessionCiphertext: string): string {
  // Stores a SHA digest, never the Telegram session or ciphertext itself.
  return createHash('sha256').update(sessionCiphertext).digest('hex').slice(0, 24);
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
}
export function notificationCopy(kind: NotificationKind, p: NotificationPayload) {
  const campaign = escapeHtml(String(p.campaign || 'Votre campagne').slice(0, 120));
  const tier = p.tier === 'business' ? 'Business' : 'Pro';
  switch (kind) {
    case 'welcome': return { subject:'Bienvenue sur Nashra', heading:'Bienvenue sur Nashra !', body:'Votre compte est prêt. Connectez votre compte Telegram pour programmer votre première annonce.', path:'/telegram', button:'Connecter Telegram' };
    case 'subscription_activated': return { subject:`Votre abonnement Nashra ${tier} est activé`, heading:'Votre abonnement est actif', body:`Votre offre ${tier} est activée. Vos fonctionnalités sont disponibles dans Nashra.`, path:'/abonnement', button:'Voir mon abonnement' };
    case 'payment_failed': return { subject:'Action requise : paiement Nashra', heading:'Votre paiement n’a pas abouti', body:'Stripe n’a pas pu confirmer votre paiement. Vérifiez votre moyen de paiement pour éviter une interruption de service.', path:'/abonnement', button:'Gérer mon paiement' };
    case 'telegram_reconnect': return { subject:'Reconnectez votre compte Telegram à Nashra', heading:'Connexion Telegram à rétablir', body:'Votre session Telegram a expiré. Reconnectez votre compte pour retrouver les fonctions nécessitant Telegram.', path:'/telegram', button:'Reconnecter Telegram' };
    case 'campaign_action_needed': return { subject:'Une campagne Nashra a besoin de votre aide', heading:'Une vérification est nécessaire', body:`La campagne « ${campaign} » attend votre intervention. Nashra ne relancera pas une publication incertaine pour éviter les doublons.`, path:'/campagnes', button:'Résoudre dans Nashra' };
  }
}
export function renderNotification(kind: NotificationKind, p: NotificationPayload, siteUrl: string) {
  const data = notificationCopy(kind,p);
  const url = `${siteUrl}${data.path}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="background:#f5f8f6;margin:0;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#1b2922"><table role="presentation" style="max-width:560px;width:100%;margin:auto;background:white;border:1px solid #dce7df;border-radius:14px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px"><div style="font-size:22px;font-weight:700;color:#163b2d">Nashra</div><h1 style="font-size:23px;margin:28px 0 14px">${escapeHtml(data.heading)}</h1><p style="font-size:15px;line-height:1.7;color:#36483d">${data.body}</p><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#196b49;color:white;padding:13px 20px;text-decoration:none;border-radius:8px;font-weight:600">${escapeHtml(data.button)}</a></p><p style="font-size:12px;line-height:1.5;color:#697970">Cet email est envoyé par Nashra pour vous informer d'un événement lié à votre compte. Ne partagez jamais vos codes Telegram.</p></td></tr></table></body></html>`;
  const text = `${data.heading}\n\n${data.body.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}\n\n${data.button} : ${url}\n\nNashra — Email lié à votre compte.`;
  return { subject:data.subject, html, text };
}
