'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useLanguage } from '@/lib/i18n/provider';
import { localeForIntl } from '@/lib/i18n';
type Billing = { enabled?: boolean; plan?: string; hasCustomer?: boolean; currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean; note?: string; error?: string };
const labels: Record<string,string> = { free: 'Gratuit', active: 'Actif (test)', trialing: 'Période d’essai (test)',
  past_due: 'Paiement en retard (test)', canceled: 'Résilié (test)', incomplete: 'En attente (test)',
  unpaid: 'Impayé (test)', paused: 'En pause (test)' };
export default function BillingPage() {
  const { locale, t } = useLanguage();
  const [data,setData] = useState<Billing>({});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function refresh() {
    setBusy(true);setError('');
    try { const res = await fetch('/api/billing/status',{cache:'no-store'});
      const payload = await res.json() as Billing;
      if (!res.ok) throw new Error(payload.error || 'Chargement impossible.'); setData(payload);
    } catch(e) { setError(e instanceof Error ? e.message : 'Erreur.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function action(mode: 'checkout' | 'portal') {
    setBusy(true);setError('');
    try { const res = await fetch(`/api/billing/${mode}`, { method:'POST',credentials:'same-origin' });
      const payload = await res.json() as {url?:string;error?:string};
      if (!res.ok || !payload.url) throw new Error(payload.error || 'Action impossible.');
      window.location.assign(payload.url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur.');setBusy(false); }
  }
  return <>
    <PageHeader eyebrow="NASHRA · FACTURATION" title="Mon abonnement" description="Préparation du modèle commercial et de la facturation Stripe en mode test." actions={<button onClick={() => void refresh()} disabled={busy} className="btn btn-secondary"><RefreshCw size={16}/> Actualiser</button>}/>
    <div className="notice-row notice-dark"><ShieldCheck size={20}/><div><strong>Aucun paiement réel dans cette version</strong><span>Stripe n’est accessible qu’avec une clé sk_test_ et l’activation explicite côté serveur. Les limites d’abonnement ne sont pas encore appliquées.</span></div></div>
    {error && <div className="n25-error" role="alert">{error}</div>}
    <div className="n25-billing"><article className="n25-plan"><div className="n25-plan-title"><CreditCard size={20}/><span>Offre actuelle</span></div>
      <strong>{t(labels[data.plan || 'free'] || data.plan || 'Gratuit')}</strong>
      <p>{data.currentPeriodEnd ? `${t('Prochaine échéance renseignée :')} ${new Date(data.currentPeriodEnd).toLocaleDateString(localeForIntl(locale))}` : 'Aucune échéance connue.'}</p>
      {data.cancelAtPeriodEnd && <p>Résiliation prévue à la fin de la période.</p>}
      <div className="n25-buttons">
        {data.enabled && !data.hasCustomer && <button disabled={busy} className="btn btn-primary" onClick={() => void action('checkout')}>Tester l’abonnement Stripe</button>}
        {data.enabled && data.hasCustomer && <button disabled={busy} className="btn btn-primary" onClick={() => void action('portal')}>Ouvrir le portail Stripe</button>}
        {!data.enabled && <span className="n25-muted">La facturation de test n’est pas activée sur le serveur.</span>}
      </div></article>
      <article className="n25-plan n25-note"><h2>Statut du module</h2><p>{data.note || 'Configuration en attente.'}</p>
        <p>La souscription, lorsqu’elle est activée en test, ne débloque pas encore de nouvelles fonctionnalités payantes.</p>
        <Link href="/operations" className="btn btn-secondary">Retour aux opérations</Link></article></div>
  </>;
}
