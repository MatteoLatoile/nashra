'use client';
import { useCallback, useEffect, useState } from 'react';
import { CreditCard, RefreshCw, ShieldCheck, CheckCircle2, Clock3 } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useLanguage } from '@/lib/i18n/provider';
import { localeForIntl } from '@/lib/i18n';
import { billingCopy } from '@/lib/billing/copy';

type Tier = 'free' | 'pro' | 'business';
type Price = { available: boolean; amount: number | null; currency: string | null; interval: string | null; intervalCount: number };
type Billing = { enabled: boolean; billingMode: 'disabled' | 'test' | 'live'; tier: Tier;
  status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
  hasCustomer: boolean; limit: number; used: number; remaining: number;
  plans: { free: {available: boolean}; pro: Price; business: Price }; error?: string };

const options: { tier: Tier; jobs: number; icon: 'free' | 'paid' }[] = [
  {tier:'free',jobs:100,icon:'free'}, {tier:'pro',jobs:300,icon:'paid'}, {tier:'business',jobs:500,icon:'paid'},
];
const labels: Record<Tier, string> = {free:'Gratuit',pro:'Pro',business:'Business'};
const info: Record<Tier,'freeInfo'|'proInfo'|'businessInfo'> = {
  free:'freeInfo',pro:'proInfo',business:'businessInfo',
};
const stateText: Record<string, string> = {
  free: 'Gratuit', active: 'Actif', trialing: 'Essai en cours',
  past_due: 'Paiement en retard', unpaid: 'Impayé',
  canceled: 'Résilié', paused: 'En pause', incomplete: 'Paiement en attente',
  incomplete_expired: 'Paiement expiré',
};

export default function BillingPage() {
  const {locale, t} = useLanguage();
  const words = billingCopy(locale);
  const [data,setData] = useState<Billing|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [returnState,setReturnState] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true);setError('');
    try {
      const res = await fetch('/api/billing/status',{cache:'no-store'});
      const body = await res.json() as Billing;
      if (!res.ok) throw new Error(body.error || 'Chargement impossible.');
      setData(body);
    } catch(e) { setError(e instanceof Error ? e.message : 'Erreur de chargement.'); }
    finally { setBusy(false); }
  },[]);
  useEffect(() => {
    const returned = new URLSearchParams(window.location.search).get('retour');
    if (returned === 'succes' || returned === 'annule') setReturnState(returned);
    void refresh();
  },[refresh]);
  async function action(mode:'checkout'|'portal', tier?:'pro'|'business') {
    setBusy(true);setError('');
    try {
      const res = await fetch(`/api/billing/${mode}`,{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        ...(tier ? {body:JSON.stringify({tier})} : {}),
      });
      const payload = await res.json() as {url?:string;error?:string};
      if (!res.ok || !payload.url) throw new Error(payload.error || 'Action impossible.');
      window.location.assign(payload.url);
    } catch(e) { setError(e instanceof Error ? e.message : 'Erreur.');setBusy(false); }
  }
  function priceText(price:Price) {
    if (!price.available || price.amount === null || !price.currency) return '—';
    try {
      const digits = new Intl.NumberFormat(localeForIntl(locale), {style:'currency',currency:price.currency}).resolvedOptions().maximumFractionDigits ?? 2;
      const amount = price.amount / (10 ** digits);
      return new Intl.NumberFormat(localeForIntl(locale),{style:'currency',currency:price.currency.toUpperCase()}).format(amount);
    } catch { return '—'; }
  }
  function dateText(value:string) {
    try { return new Date(value).toLocaleDateString(localeForIntl(locale),{year:'numeric',month:'long',day:'numeric'}); }
    catch { return value; }
  }
  return <>
    <PageHeader eyebrow="NASHRA · ABONNEMENT" title={t('Mon abonnement')}
      description={words.intro}
      actions={<button onClick={() => void refresh()} disabled={busy} className="btn btn-secondary">
        <RefreshCw size={16}/>{words.refresh}</button>}/>
    <div className="notice-row notice-dark"><ShieldCheck size={20}/><div>
      <strong>{data?.billingMode === 'live' ? words.live : data?.billingMode === 'test' ? words.test : words.off}</strong>
      <span>{words.paymentNote}</span>
    </div></div>
    {returnState && <p role="status" className="notice-row notice-dark">{returnState === 'succes' ? words.returnSuccess : words.returnCancel}</p>}
    {error && <div className="n25-error" role="alert">{error}</div>}
    <div className="n25-billing" style={{gridTemplateColumns:'minmax(0,1fr)'}}>
      <section className="n25-plan" aria-label={words.current}>
        <div className="n25-plan-title"><CreditCard size={20}/><span>{words.current}</span></div>
        <strong>{data ? t(labels[data.tier]) : words.loading}</strong>
        <p>{words.status}: {data ? (stateText[data.status] || data.status) : words.loading}.
          {' '}{data?.currentPeriodEnd ? `${data.cancelAtPeriodEnd ? words.endDate : words.renewal} ${dateText(data.currentPeriodEnd)}.` : words.noDue}</p>
        <p><Clock3 size={14} style={{display:'inline',verticalAlign:'middle',marginInlineEnd:5}}/>
          {data ? `${data.used} / ${data.limit} ${words.jobs}` : '—'}</p>
        <p>{words.jobsNote}</p>
        {data?.hasCustomer && <button className="btn btn-secondary" disabled={busy}
          onClick={() => void action('portal')}>{words.manage}</button>}
      </section>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:16,margin:'20px 0'}}>
      {options.map(opt => {
        const price = opt.tier !== 'free' && data ? data.plans[opt.tier] : null;
        const current = data?.tier === opt.tier;
        const available = data?.enabled && (opt.tier === 'free' || price?.available);
        return <article key={opt.tier} className="n25-plan" style={{borderColor:current?'#a1a1aa':undefined}}>
          <div className="n25-plan-title">{current ? <CheckCircle2 size={20}/> : <CreditCard size={20}/>}
            <span>{opt.tier === 'free' ? t('Gratuit') : labels[opt.tier]}</span></div>
          <strong>{opt.tier === 'free' ? t('Gratuit') : price && price.available ? priceText(price) : '—'}</strong>
          {price?.available && <p>/{price.interval === 'year' ? words.year : words.month}</p>}
          <p>{words[info[opt.tier]]}</p>
          <p><strong>{opt.jobs}</strong> {words.jobs}</p>
          {current ? <span className="btn btn-secondary" style={{cursor:'default'}}>
              <CheckCircle2 size={16}/>{words.current}</span> : opt.tier === 'free' ?
            <span className="n25-muted">{words.freeInfo}</span> : data?.hasCustomer ?
            <button disabled={busy} className="btn btn-secondary" onClick={() => void action('portal')}>{words.manage}</button> :
            <button disabled={!available || busy} className="btn btn-primary" onClick={() => void action('checkout',opt.tier as 'pro'|'business')}>
              {available ? words.select : words.unavailable}</button>}
        </article>;
      })}
    </div>
    {!data?.enabled && <p className="n25-muted" role="status">{words.billingDisabled}</p>}
  </>;
}
