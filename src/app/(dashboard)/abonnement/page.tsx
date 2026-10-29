'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BillingFlowLoader } from '@/components/billing-flow-loader';
import { CreditCard, RefreshCw, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useLanguage } from '@/lib/i18n/provider';
import { localeForIntl } from '@/lib/i18n';
import { billingCopy } from '@/lib/billing/copy';
import { usageCopy } from '@/lib/billing/usage-copy';

type Tier = 'free' | 'pro' | 'business';
type Interval = 'month' | 'year';
type Price = { available: boolean; amount: number | null; currency: string | null; interval: string | null; intervalCount: number };
type Billing = { enabled: boolean; billingMode: 'disabled' | 'test' | 'live'; tier: Tier;
  status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
  hasCustomer: boolean; limit: number; used: number; remaining: number;
  usage?: Record<'telegramAccounts'|'activeGroups'|'monthlySends'|'pendingSchedules',{used:number;limit:number;confirmed?:number}>;
  catalog?: {slug:Tier;monthly_price_usd_cents:number;annual_price_usd_cents:number;
    max_telegram_accounts:number;max_active_groups:number;max_monthly_sends:number;max_pending_schedules:number;priority_support:boolean}[];
  plans: { free: {available: boolean}; pro: Record<Interval,Price>; business: Record<Interval,Price> }; error?: string };

const options: Tier[] = ['free','pro','business'];
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

function BillingPageContent() {
  const searchParams = useSearchParams();
  const requestedTier = searchParams.get('checkout');
  const requestedInterval = searchParams.get('interval');
  const automaticTier = requestedTier === 'pro' || requestedTier === 'business' ? requestedTier : null;
  const automaticInterval = requestedInterval === 'month' || requestedInterval === 'year' ? requestedInterval : null;
  const automaticRequest = automaticTier && automaticInterval ? {tier: automaticTier, interval: automaticInterval} : null;
  const {locale, t} = useLanguage();
  const words = billingCopy(locale);
  const usageWords = usageCopy(locale);
  const [data,setData] = useState<Billing|null>(null);
  const automaticCheckoutStarted = useRef(false);
  const [interval,setInterval] = useState<Interval>('month');
  const [busy,setBusy] = useState(false);
  const [automaticStage,setAutomaticStage] = useState<'checking'|'opening'|'idle'>(automaticRequest ? 'checking' : 'idle');
  const [redirecting,setRedirecting] = useState(false);
  const [redirectingMode,setRedirectingMode] = useState<'checkout'|'portal'|null>(null);
  const [redirectingOffer,setRedirectingOffer] = useState<string | null>(null);
  const [error,setError] = useState('');
  const [returnState,setReturnState] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true);setError('');
    try {
      const res = await fetch('/api/billing/status',{cache:'no-store'});
      const body = await res.json() as Billing;
      if (!res.ok) throw new Error(body.error || 'Chargement impossible.');
      setData(body);
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.');
      setAutomaticStage('idle'); // Ne pas masquer une erreur sous un loader infini.
    }
    finally { setBusy(false); }
  },[]);
  useEffect(() => {
    const returned = new URLSearchParams(window.location.search).get('retour');
    if (returned === 'succes' || returned === 'annule') setReturnState(returned);
    void refresh();
  },[refresh]);
  async function action(mode:'checkout'|'portal', tier?:'pro'|'business', selectedInterval: Interval = interval) {
    setBusy(true);setError('');
    setRedirecting(true);
    setRedirectingMode(mode);
    if (tier) setRedirectingOffer(`${tier === 'pro' ? 'Pro' : 'Business'} · ${selectedInterval === 'year' ? 'Annuel' : 'Mensuel'}`);
    if (automaticRequest) setAutomaticStage('opening');
    try {
      const res = await fetch(`/api/billing/${mode}`,{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        ...(tier ? {body:JSON.stringify({tier,interval:selectedInterval})} : {}),
      });
      const payload = await res.json() as {url?:string;error?:string};
      if (!res.ok || !payload.url) throw new Error(payload.error || 'Action impossible.');
      window.location.assign(payload.url);
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Erreur.');
      setBusy(false);
      setRedirecting(false);
      setRedirectingMode(null);
      setAutomaticStage('idle'); // Rendre la page interactive en cas d'échec.
    }
  }
  useEffect(() => {
    if (!data || busy || automaticCheckoutStarted.current || !automaticRequest) return;
    automaticCheckoutStarted.current = true;
    const {tier, interval: selectedInterval} = automaticRequest;
    if (!data.enabled || !data.plans[tier][selectedInterval].available) {
      setError('Cette offre est momentanément indisponible. Choisissez une autre offre ci-dessous.');
      setAutomaticStage('idle');
      return;
    }
    setInterval(selectedInterval);
    // Une souscription en cours se gère depuis le portail ; un ancien client
    // revenu au forfait Gratuit peut souscrire de nouveau via Checkout.
    if (data.hasCustomer && data.tier !== 'free') {
      void action('portal');
    } else {
      void action('checkout', tier, selectedInterval);
    }
  // Une seule tentative automatique pour éviter de créer plusieurs sessions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, busy, requestedTier, requestedInterval]);
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
    {(automaticStage !== 'idle' || redirecting) && <BillingFlowLoader
      step="payment"
      offer={redirectingOffer || (automaticRequest ? `${automaticRequest.tier === 'pro' ? 'Pro' : 'Business'} · ${automaticRequest.interval === 'year' ? 'Annuel' : 'Mensuel'}` : undefined)}
      title={automaticStage === 'checking' ? 'Vérification de votre offre…' : redirectingMode === 'portal' ? 'Ouverture de votre espace de facturation…' : 'Ouverture du paiement sécurisé…'}
      subtitle={automaticStage === 'checking' ? 'Nous vérifions votre compte et le tarif sélectionné.' : redirectingMode === 'portal' ? 'Vous allez gérer votre abonnement sur Stripe.' : 'Redirection vers Stripe en cours.'}
    />}
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
        {data?.usage && <div style={{display:'grid',gap:8,marginTop:12}}>
          {([['telegramAccounts',usageWords.accounts],['activeGroups',usageWords.groups],['monthlySends',usageWords.sends],['pendingSchedules',usageWords.pending]] as const).map(([key,label]) => {
            const meter=data.usage![key];
            const ratio=meter.limit ? meter.used/meter.limit : 0;
            return <div key={key} style={{padding:'10px 12px',border:'1px solid #36363a',borderRadius:10}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12}}><span>{label}</span>
                <strong>{meter.used} / {meter.limit}</strong></div>
              <div role="progressbar" aria-valuenow={Math.min(meter.used,meter.limit)} aria-valuemin={0} aria-valuemax={meter.limit}
                aria-label={label} style={{marginTop:8,height:5,background:'#27272a',borderRadius:5,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.min(100,ratio*100)}%`,background:ratio>=1?'#ef4444':ratio>=0.8?'#eab308':'#a1a1aa'}}/>
              </div>
              {ratio>=0.8 && <p role="status" style={{margin:'7px 0 0',fontSize:13}}>{ratio>=1?usageWords.reached:usageWords.near}</p>}
            </div>;
          })}
        </div>}
        {data?.hasCustomer && <button className="btn btn-secondary" disabled={busy}
          onClick={() => void action('portal')}>{words.manage}</button>}
      </section>
    </div>
    <div role="group" aria-label={`${words.month} / ${words.year}`} style={{display:'flex',gap:8,margin:'18px 0 8px'}}>
      {(['month','year'] as const).map(option =>
        <button key={option} type="button" className={`btn ${interval===option?'btn-primary':'btn-secondary'}`}
          aria-pressed={interval===option} onClick={()=>setInterval(option)}>
          {option==='month'?words.month:words.year}
        </button>)}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:16,margin:'20px 0'}}>
      {options.map(tier => {
        const price = tier !== 'free' && data ? data.plans[tier][interval] : null;
        const current = data?.tier === tier;
        const available = data?.enabled && (tier === 'free' || price?.available);
        const limits=data?.catalog?.find(x=>x.slug===tier);
        return <article key={tier} className="n25-plan" style={{borderColor:current?'#a1a1aa':undefined}}>
          <div className="n25-plan-title">{current ? <CheckCircle2 size={20}/> : <CreditCard size={20}/>}
            <span>{tier === 'free' ? t('Gratuit') : labels[tier]}</span></div>
          <strong>{tier === 'free' ? t('Gratuit') : price && price.available ? priceText(price) : '—'}</strong>
          {tier !== 'free' && <p>/{interval === 'month' ? words.month : words.year}</p>}
          <p>{words[info[tier]]}</p>
          {limits && <div style={{marginBottom:14,fontSize:14,lineHeight:1.9}}>
            <div>{usageWords.accounts}: <strong>{limits.max_telegram_accounts}</strong></div>
            <div>{usageWords.groups}: <strong>{limits.max_active_groups}</strong></div>
            <div>{usageWords.sends}: <strong>{limits.max_monthly_sends}</strong></div>
            <div>{usageWords.pending}: <strong>{limits.max_pending_schedules}</strong></div>
            {limits.priority_support && <div>{usageWords.priority}</div>}
          </div>}
          {current ? <span className="btn btn-secondary" style={{cursor:'default'}}>
              <CheckCircle2 size={16}/>{words.current}</span> : tier === 'free' ?
            <span className="n25-muted">{words.freeInfo}</span> : data?.hasCustomer ?
            <button disabled={busy} className="btn btn-secondary" onClick={() => void action('portal')}>{words.manage}</button> :
            <button disabled={!available || busy} className="btn btn-primary" onClick={() => void action('checkout',tier as 'pro'|'business')}>
              {available ? words.select : words.unavailable}</button>}
        </article>;
      })}
    </div>
    {!data?.enabled && <p className="n25-muted" role="status">{words.billingDisabled}</p>}
  </>;
}


export default function BillingPage() {
  return <Suspense fallback={<BillingFlowLoader step="payment" title="Vérification de votre offre…" />}>
    <BillingPageContent />
  </Suspense>;
}
