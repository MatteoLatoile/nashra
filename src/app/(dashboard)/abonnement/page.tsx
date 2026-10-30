'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Zap,
} from 'lucide-react';
import { BillingFlowLoader } from '@/components/billing-flow-loader';
import { CheckoutResultNotice } from '@/components/checkout-result-notice';
import { useLanguage } from '@/lib/i18n/provider';
import { localeForIntl } from '@/lib/i18n';
import { billingCopy } from '@/lib/billing/copy';
import { usageCopy } from '@/lib/billing/usage-copy';

type Tier = 'free' | 'pro' | 'business';
type Interval = 'month' | 'year';
type Metric = 'telegramAccounts' | 'activeGroups' | 'monthlySends' | 'pendingSchedules';
type Price = {
  available: boolean;
  amount: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number;
};
type Plan = {
  slug: Tier;
  monthly_price_usd_cents: number;
  annual_price_usd_cents: number;
  max_telegram_accounts: number;
  max_active_groups: number;
  max_monthly_sends: number;
  max_pending_schedules: number;
  priority_support: boolean;
};
type Billing = {
  enabled: boolean;
  billingMode: 'disabled' | 'test' | 'live';
  tier: Tier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  limit: number;
  used: number;
  remaining: number;
  usage?: Record<Metric, { used: number; limit: number; confirmed?: number }>;
  catalog?: Plan[];
  plans: {
    free: { available: boolean };
    pro: Record<Interval, Price>;
    business: Record<Interval, Price>;
  };
  error?: string;
};

const tiers: Tier[] = ['free', 'pro', 'business'];
const tierLabels: Record<Tier, string> = { free: 'Free', pro: 'Pro', business: 'Business' };
const planInfo: Record<Tier, 'freeInfo' | 'proInfo' | 'businessInfo'> = {
  free: 'freeInfo', pro: 'proInfo', business: 'businessInfo',
};

function requiresPortal(status: string): boolean {
  return ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(status);
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const checkoutSessionId = searchParams.get('session_id');
  const requestedTier = searchParams.get('checkout');
  const requestedInterval = searchParams.get('interval');
  const automaticTier = requestedTier === 'pro' || requestedTier === 'business' ? requestedTier : null;
  const automaticInterval = requestedInterval === 'month' || requestedInterval === 'year' ? requestedInterval : null;
  const automaticRequest: { tier: 'pro' | 'business'; interval: Interval } | null =
    automaticTier && automaticInterval ? { tier: automaticTier, interval: automaticInterval } : null;

  const { locale, t } = useLanguage();
  const words = billingCopy(locale);
  const usageWords = usageCopy(locale);
  const isFr = String(locale).toLowerCase().startsWith('fr');
  const ui = {
    eyebrow: isFr ? 'FACTURATION / VOTRE ESPACE' : 'BILLING / YOUR WORKSPACE',
    heading: isFr ? 'Un forfait à votre rythme.' : 'A plan that moves with you.',
    subheading: isFr ? 'Votre abonnement, vos avantages et votre facturation. Tout au même endroit.' : 'Your subscription, usage and billing. All in one beautiful place.',
    currentLabel: isFr ? 'VOTRE ABONNEMENT ACTUEL' : 'YOUR CURRENT PLAN',
    currentHint: isFr ? 'Votre espace est prêt à évoluer.' : 'Your workspace is ready to grow.',
    currentPrefix: isFr ? 'NASHRA / FORFAIT' : 'NASHRA / PLAN',
    subscriptionStatus: isFr ? 'Statut de votre abonnement' : 'Subscription status',
    activated: isFr ? 'Votre abonnement est actif' : 'Your subscription is active',
    freeMessage: isFr ? 'Vous profitez actuellement du forfait gratuit.' : 'You are currently on the free plan.',
    canceledMessage: isFr ? 'Votre ancien abonnement est résilié. Vous êtes revenu au forfait Gratuit.' : 'Your previous subscription has ended. You are back on Free.',
    endingMessage: isFr ? 'Résiliation programmée' : 'Cancellation scheduled',
    endingDetail: isFr ? 'Vos avantages restent accessibles jusqu’au' : 'Your benefits remain active until',
    nextPayment: isFr ? 'Prochain renouvellement' : 'Next renewal',
    usageLabel: isFr ? 'UTILISATION' : 'YOUR USAGE',
    usageTitle: isFr ? 'Votre activité en un coup d’œil' : 'Everything at a glance',
    usageFoot: isFr ? 'Les limites s’adaptent automatiquement à votre forfait.' : 'Limits adapt automatically to your plan.',
    chooseTitle: isFr ? 'Trouvez votre formule.' : 'Find your perfect fit.',
    chooseDesc: isFr ? 'Commencez gratuitement, évoluez quand vous en avez besoin.' : 'Start free. Upgrade when your ideas get bigger.',
    recommended: isFr ? 'LE PLUS POPULAIRE' : 'MOST POPULAR',
    month: isFr ? 'Mensuel' : 'Monthly',
    year: isFr ? 'Annuel' : 'Yearly',
    yearlyHint: isFr ? '2 mois offerts' : 'Save 2 months',
    billedYearly: isFr ? 'facturé annuellement' : 'billed annually',
    billedMonthly: isFr ? 'facturé chaque mois' : 'billed monthly',
    perMonth: isFr ? '/ mois' : '/ month',
    perYear: isFr ? '/ an' : '/ year',
    included: isFr ? 'CE QUI EST INCLUS' : 'WHAT’S INCLUDED',
    currentButton: isFr ? 'Votre forfait actuel' : 'Your current plan',
    chooseButton: isFr ? 'Choisir' : 'Choose',
    manageButton: isFr ? 'Gérer l’abonnement' : 'Manage subscription',
    pastBilling: isFr ? 'Gérer mes factures' : 'View billing history',
    stripeTitle: isFr ? 'Paiements sécurisés par Stripe' : 'Secure payments powered by Stripe',
    stripeNote: isFr ? 'Aucun paiement n’est traité directement par Nashra.' : 'Payment details are securely handled by Stripe.',
    testBadge: isFr ? 'SANDBOX · AUCUN DÉBIT RÉEL' : 'SANDBOX · NO REAL CHARGES',
    liveBadge: isFr ? 'FACTURATION SÉCURISÉE' : 'SECURE BILLING',
    disabledBadge: isFr ? 'FACTURATION INDISPONIBLE' : 'BILLING UNAVAILABLE',
    priority: isFr ? 'Assistance prioritaire' : 'Priority support',
    statusText: (status: string) => {
      const statuses: Record<string, [string, string]> = {
        free: ['Gratuit', 'Free'], active: ['Actif', 'Active'], trialing: ['Essai en cours', 'Trialing'],
        past_due: ['Paiement en retard', 'Past due'], unpaid: ['Impayé', 'Unpaid'],
        canceled: ['Résilié', 'Canceled'], paused: ['En pause', 'Paused'],
        incomplete: ['Paiement en attente', 'Payment pending'],
        incomplete_expired: ['Paiement expiré', 'Payment expired'],
      };
      return statuses[status]?.[isFr ? 0 : 1] ?? status;
    },
  };

  const [data, setData] = useState<Billing | null>(null);
  const [interval, setInterval] = useState<Interval>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [returnState, setReturnState] = useState('');
  const [automaticStage, setAutomaticStage] = useState<'checking' | 'opening' | 'idle'>(
    automaticRequest ? 'checking' : 'idle',
  );
  const [redirecting, setRedirecting] = useState(false);
  const [redirectingMode, setRedirectingMode] = useState<'checkout' | 'portal' | null>(null);
  const [redirectingOffer, setRedirectingOffer] = useState<string | null>(null);
  const automaticCheckoutStarted = useRef(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      const body = await res.json() as Billing;
      if (!res.ok) throw new Error(body.error || 'Chargement impossible.');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      setAutomaticStage('idle');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const returned = new URLSearchParams(window.location.search).get('retour');
    if (returned === 'succes' || returned === 'annule') setReturnState(returned);
    void refresh();
  }, [refresh]);

  async function action(mode: 'checkout' | 'portal', tier?: 'pro' | 'business', selectedInterval: Interval = interval) {
    setBusy(true);
    setError('');
    setRedirecting(true);
    setRedirectingMode(mode);
    if (tier) setRedirectingOffer(`${tier === 'pro' ? 'Pro' : 'Business'} · ${selectedInterval === 'year' ? 'Annuel' : 'Mensuel'}`);
    if (automaticRequest) setAutomaticStage('opening');
    try {
      const res = await fetch(`/api/billing/${mode}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...(tier ? { body: JSON.stringify({ tier, interval: selectedInterval }) } : {}),
      });
      const payload = await res.json() as { url?: string; error?: string };
      if (!res.ok || !payload.url) throw new Error(payload.error || 'Action impossible.');
      window.location.assign(payload.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
      setBusy(false);
      setRedirecting(false);
      setRedirectingMode(null);
      setAutomaticStage('idle');
    }
  }

  useEffect(() => {
    if (!data || busy || automaticCheckoutStarted.current || !automaticRequest) return;
    automaticCheckoutStarted.current = true;
    const { tier, interval: selectedInterval } = automaticRequest;
    if (!data.enabled || !data.plans[tier][selectedInterval].available) {
      setError('Cette offre est momentanément indisponible. Choisissez une autre offre ci-dessous.');
      setAutomaticStage('idle');
      return;
    }
    setInterval(selectedInterval);
    if (requiresPortal(data.status)) {
      void action('portal');
    } else {
      void action('checkout', tier, selectedInterval);
    }
    // Une seule tentative automatique : évite les sessions Checkout répétées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, busy, requestedTier, requestedInterval]);

  function priceText(price: Price) {
    if (!price.available || price.amount === null || !price.currency) return '—';
    try {
      const digits = new Intl.NumberFormat(localeForIntl(locale), {
        style: 'currency', currency: price.currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
      return new Intl.NumberFormat(localeForIntl(locale), {
        style: 'currency', currency: price.currency.toUpperCase(),
      }).format(price.amount / (10 ** digits));
    } catch {
      return '—';
    }
  }

  function dateText(value: string) {
    try {
      return new Date(value).toLocaleDateString(localeForIntl(locale), {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      return value;
    }
  }

  const currentTier = data?.tier ?? 'free';
  const status = data?.status ?? 'free';
  const isCanceled = status === 'canceled' || status === 'incomplete_expired';
  const isPaid = currentTier !== 'free';
  const statusTone = isCanceled ? 'muted' : status === 'active' || status === 'trialing' ? 'success' : 'neutral';
  const metrics = [
    { key: 'telegramAccounts' as const, label: usageWords.accounts, icon: CreditCard },
    { key: 'activeGroups' as const, label: usageWords.groups, icon: UsersRound },
    { key: 'monthlySends' as const, label: usageWords.sends, icon: Send },
    { key: 'pendingSchedules' as const, label: usageWords.pending, icon: CalendarDays },
  ];

  return (
    <div className="nx-billing">
      <style>{styles}</style>
      {(automaticStage !== 'idle' || redirecting) && (
        <BillingFlowLoader
          step="payment"
          offer={redirectingOffer || (automaticRequest
            ? `${automaticRequest.tier === 'pro' ? 'Pro' : 'Business'} · ${automaticRequest.interval === 'year' ? 'Annuel' : 'Mensuel'}`
            : undefined)}
          title={automaticStage === 'checking'
            ? 'Vérification de votre offre…'
            : redirectingMode === 'portal'
              ? 'Ouverture de votre espace de facturation…'
              : 'Ouverture du paiement sécurisé…'}
          subtitle={automaticStage === 'checking'
            ? 'Nous vérifions votre compte et le tarif sélectionné.'
            : redirectingMode === 'portal'
              ? 'Vous allez gérer votre abonnement sur Stripe.'
              : 'Redirection vers Stripe en cours.'}
        />
      )}

      <header className="nx-head">
        <div>
          <div className="nx-eyebrow"><span className="nx-eyebrow-line" />NASHRA <span className="nx-eyebrow-sep">/</span> {ui.eyebrow}</div>
          <h1>{t('Mon abonnement')}<span className="nx-dot">.</span></h1>
          <p>{ui.subheading}</p>
        </div>
        <button type="button" className="nx-refresh" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={16} className={busy ? 'nx-spinning' : ''} />{words.refresh}
        </button>
      </header>

      <div className={`nx-environment nx-env-${data?.billingMode ?? 'disabled'}`} role="status">
        <div className="nx-environment-icon"><ShieldCheck size={17} /></div>
        <div>
          <strong>{data?.billingMode === 'test' ? ui.testBadge : data?.billingMode === 'live' ? ui.liveBadge : ui.disabledBadge}</strong>
          <span>{data?.billingMode === 'test' ? words.test : data?.billingMode === 'live' ? words.paymentNote : words.off}</span>
        </div>
        <LockKeyhole size={16} className="nx-env-end" />
      </div>

      {returnState === 'succes' && checkoutSessionId
        ? <CheckoutResultNotice sessionId={checkoutSessionId} onActivated={refresh} />
        : returnState === 'succes'
          ? <div role="alert" className="nx-error">Impossible de vérifier ce retour de paiement. Consultez votre forfait.</div>
          : returnState === 'annule'
            ? <div role="status" className="nx-info">{words.returnCancel}</div>
            : null}
      {error && <div className="nx-error" role="alert">{error}</div>}

      <div className="nx-overview-grid">
        <section className="nx-current-card" aria-label={words.current}>
          <div className="nx-card-glow" aria-hidden="true" />
          <div className="nx-card-top">
            <span className="nx-card-label"><span className="nx-small-orb" />{ui.currentLabel}</span>
            <span className={`nx-status-pill nx-status-${statusTone}`}>
              <span className="nx-status-indicator" />{data ? ui.statusText(status) : words.loading}
            </span>
          </div>
          <div className="nx-current-main">
            <div className="nx-plan-symbol"><Zap size={28} strokeWidth={2.3} /></div>
            <div className="nx-current-details">
              <span className="nx-muted-upper">{ui.currentPrefix}</span>
              <h2>{data ? (currentTier === 'free' ? t('Gratuit') : tierLabels[currentTier]) : '—'}<span className="nx-plan-period">{isPaid ? ' / Nashra' : ''}</span></h2>
            </div>
          </div>
          <p className="nx-current-summary">
            {!data ? words.loading
              : isCanceled ? ui.canceledMessage
                : data.cancelAtPeriodEnd && data.currentPeriodEnd
                  ? `${ui.endingDetail} ${dateText(data.currentPeriodEnd)}.`
                  : isPaid ? ui.activated : ui.freeMessage}
          </p>
          <div className="nx-current-footer">
            <div className="nx-current-meta">
              <CalendarDays size={17} />
              <span>{data?.cancelAtPeriodEnd && data.currentPeriodEnd
                ? `${ui.endingMessage} · ${dateText(data.currentPeriodEnd)}`
                : isCanceled ? ui.statusText(status)
                  : data?.currentPeriodEnd && isPaid
                    ? `${ui.nextPayment} · ${dateText(data.currentPeriodEnd)}`
                    : ui.currentHint}
              </span>
            </div>
            {data?.hasCustomer && (
              <button type="button" className="nx-inline-action" disabled={busy} onClick={() => void action('portal')}>
                {requiresPortal(status) ? ui.manageButton : ui.pastBilling}<ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </section>

        <section className="nx-usage-card" aria-label={ui.usageLabel}>
          <div className="nx-section-eyebrow">{ui.usageLabel}</div>
          <h2>{ui.usageTitle}</h2>
          <div className="nx-metrics">
            {metrics.map(({ key, label, icon: Icon }) => {
              const meter = data?.usage?.[key];
              const used = meter?.used ?? 0;
              const limit = meter?.limit ?? 0;
              const progress = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
              const over = limit > 0 && used >= limit;
              return (
                <div key={key} className="nx-metric">
                  <div className="nx-metric-row">
                    <div className="nx-metric-icon"><Icon size={15} /></div>
                    <span className="nx-metric-label">{label}</span>
                  </div>
                  <div className="nx-metric-value">{data ? used.toLocaleString(localeForIntl(locale)) : '—'}
                    <span> / {data ? limit.toLocaleString(localeForIntl(locale)) : '—'}</span>
                  </div>
                  <div className="nx-progress-track" role="progressbar" aria-label={label}
                    aria-valuemin={0} aria-valuemax={limit || 1} aria-valuenow={Math.min(used, limit || 1)}>
                    <div className={`nx-progress-fill${over ? ' nx-progress-over' : ''}`} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="nx-usage-foot"><Sparkles size={14} /> {ui.usageFoot}</div>
        </section>
      </div>

      <section className="nx-pricing-section" aria-label={ui.chooseTitle}>
        <div className="nx-pricing-head">
          <div>
            <div className="nx-section-eyebrow">{isFr ? 'VOTRE PROCHAINE ÉTAPE' : 'BUILT FOR YOUR NEXT STEP'}</div>
            <h2>{ui.chooseTitle}</h2>
            <p>{ui.chooseDesc}</p>
          </div>
          <div className="nx-cycle" role="group" aria-label={`${words.month} / ${words.year}`}>
            <button type="button" aria-pressed={interval === 'month'}
              className={interval === 'month' ? 'nx-cycle-active' : ''}
              onClick={() => setInterval('month')}>{ui.month}</button>
            <button type="button" aria-pressed={interval === 'year'}
              className={interval === 'year' ? 'nx-cycle-active' : ''}
              onClick={() => setInterval('year')}>{ui.year}<span className="nx-saving">−17%</span></button>
          </div>
        </div>

        <div className="nx-plan-grid">
          {tiers.map((tier) => {
            const current = data?.tier === tier;
            const price = tier !== 'free' && data ? data.plans[tier][interval] : null;
            const available = Boolean(data?.enabled && (tier === 'free' || price?.available));
            const limits = data?.catalog?.find((item) => item.slug === tier);
            const showPortal = Boolean(data && requiresPortal(data.status));
            const features = limits ? [
              `${limits.max_telegram_accounts} ${usageWords.accounts}`,
              `${limits.max_active_groups.toLocaleString(localeForIntl(locale))} ${usageWords.groups}`,
              `${limits.max_monthly_sends.toLocaleString(localeForIntl(locale))} ${usageWords.sends}`,
              `${limits.max_pending_schedules.toLocaleString(localeForIntl(locale))} ${usageWords.pending}`,
            ] : [];
            return (
              <article key={tier} className={`nx-price-card nx-price-${tier}${current ? ' nx-price-current' : ''}`}>
                {tier === 'pro' && <div className="nx-popular"><Sparkles size={12} />{ui.recommended}</div>}
                <div className="nx-price-card-inner">
                  <div className="nx-price-topline">
                    <span className="nx-tier-name">{tier === 'free' ? t('Gratuit') : tierLabels[tier]}</span>
                    <span className="nx-tier-mark">{tier === 'free' ? <Check size={18} /> : tier === 'pro' ? <Zap size={18} /> : <Sparkles size={18} />}</span>
                  </div>
                  <div className="nx-price-amount">
                    {tier === 'free' ? <span className="nx-free-price">$0</span>
                      : <><strong>{price ? priceText(price) : '—'}</strong><span>{interval === 'year' ? ui.perYear : ui.perMonth}</span></>}
                  </div>
                  <p className="nx-price-sub">{tier === 'free' ? ui.freeMessage : words[planInfo[tier]]}</p>
                  <div className="nx-features-title">{ui.included}</div>
                  <div className="nx-features">
                    {features.map((feature) => (
                      <div key={feature}><span className="nx-feature-check"><Check size={13} strokeWidth={2.5} /></span><span>{feature}</span></div>
                    ))}
                    {limits?.priority_support && <div><span className="nx-feature-check"><Check size={13} strokeWidth={2.5} /></span><span>{ui.priority}</span></div>}
                  </div>
                  <div className="nx-price-cta">
                    {current ? (
                      <span className="nx-action-current"><CheckCircle2 size={17} />{ui.currentButton}</span>
                    ) : tier === 'free' ? (
                      <span className="nx-action-muted">{words.freeInfo}</span>
                    ) : showPortal ? (
                      <button type="button" className="nx-action-secondary" disabled={busy} onClick={() => void action('portal')}>
                        {ui.manageButton}<ArrowUpRight size={17} />
                      </button>
                    ) : (
                      <button type="button" className={tier === 'pro' ? 'nx-action-primary' : 'nx-action-secondary'}
                        disabled={!available || busy} onClick={() => void action('checkout', tier, interval)}>
                        {available ? `${ui.chooseButton} ${tierLabels[tier]}` : words.unavailable}<ArrowRight size={17} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!data?.enabled && <div className="nx-info" role="status">{words.billingDisabled}</div>}
      </section>

      <footer className="nx-footer">
        <div className="nx-footer-icon"><ShieldCheck size={18} /></div>
        <div><strong>{ui.stripeTitle}</strong><span>{ui.stripeNote}</span></div>
        <span className="nx-footer-right"><LockKeyhole size={14} /> SECURE CHECKOUT</span>
      </footer>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingFlowLoader step="payment" title="Vérification de votre offre…" />}>
      <BillingPageContent />
    </Suspense>
  );
}

const styles = `
.nx-billing{--nx-bg:#0c0e11;--nx-line:#262b30;--nx-muted:#8d969f;--nx-ink:#f5f7f6;--nx-mint:#b7f4ce;position:relative;width:100%;padding:4px 0 70px;color:var(--nx-ink);font-family:inherit;isolation:isolate;}
.nx-billing *, .nx-billing *::before, .nx-billing *::after{box-sizing:border-box;}
.nx-billing button{font:inherit;cursor:pointer;}
.nx-billing button:disabled{opacity:.5;cursor:not-allowed;}
.nx-billing button:focus-visible{outline:2px solid #c6ffd9;outline-offset:4px;}
.nx-head{display:flex;justify-content:space-between;align-items:flex-start;gap:26px;margin-bottom:28px;}
.nx-eyebrow,.nx-section-eyebrow,.nx-card-label,.nx-features-title{font-size:10px;letter-spacing:.19em;font-weight:800;color:#b5c4be;}
.nx-eyebrow{display:flex;align-items:center;gap:11px;margin-bottom:15px;}
.nx-eyebrow-line{display:inline-block;width:18px;height:2px;border-radius:2px;background:#acffd0;box-shadow:0 0 15px #9dfcc27d;}
.nx-eyebrow-sep{color:#535d57;}
.nx-head h1{font-size:clamp(31px,3vw,46px);line-height:1.08;letter-spacing:-.055em;font-weight:750;margin:0 0 12px;color:#f7f8f8;}
.nx-dot{color:#b8f5d0;}
.nx-head p{margin:0;color:#98a19f;font-size:14px;line-height:1.6;}
.nx-refresh{white-space:nowrap;border:1px solid #30363b;background:linear-gradient(180deg,#1d2125,#15191c);color:#e6eeeb;padding:12px 17px;border-radius:11px;display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:13px;transition:background .2s,border-color .2s,transform .2s;}
.nx-refresh:hover{border-color:#5c7568;background:#252c2b;transform:translateY(-1px);}
.nx-spinning{animation:nx-spin 1s linear infinite;}
@keyframes nx-spin{to{transform:rotate(360deg)}}
.nx-environment{padding:14px 19px;border-radius:13px;background:linear-gradient(90deg,rgba(34,58,44,.57),rgba(25,32,29,.53));border:1px solid #355440;display:flex;align-items:center;gap:12px;margin-bottom:20px;}
.nx-env-test{background:linear-gradient(90deg,rgba(65,52,31,.55),rgba(32,28,25,.55));border-color:#594a30;}
.nx-env-disabled{background:linear-gradient(90deg,#292322,#1f2022);border-color:#4c3937;}
.nx-environment-icon{width:33px;height:33px;border-radius:10px;color:#bdf5ce;background:#234232;display:grid;place-items:center;flex:none;}
.nx-env-test .nx-environment-icon{background:#51452b;color:#ffe0a0;}
.nx-environment strong{display:block;color:#e3eae5;letter-spacing:.085em;font-size:10px;font-weight:800;margin-bottom:3px;}
.nx-environment span{display:block;color:#9daa9f;font-size:12px;line-height:1.45;}
.nx-env-end{margin-left:auto;color:#70867a;flex:none;}
.nx-error,.nx-info{margin:15px 0;padding:16px;border-radius:12px;border:1px solid #7b4246;color:#ffd5da;background:#3b2025;font-size:13px;}
.nx-info{border-color:#3a4f4a;background:#1c2a29;color:#c1eee4;}
.nx-overview-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:17px;}
.nx-current-card,.nx-usage-card{border-radius:19px;border:1px solid #30383a;min-width:0;position:relative;overflow:hidden;}
.nx-current-card{background:radial-gradient(ellipse at 88% 12%,rgba(137,246,182,.14),transparent 49%),linear-gradient(135deg,#1b2924 0%,#14201c 50%,#141b1a 100%);padding:26px 27px 21px;display:flex;flex-direction:column;min-height:317px;}
.nx-card-glow{position:absolute;pointer-events:none;width:280px;height:280px;border:1px solid rgba(174,255,201,.12);border-radius:50%;right:-125px;top:-120px;box-shadow:0 0 0 40px rgba(173,255,201,.028),0 0 0 81px rgba(173,255,201,.02);}
.nx-card-top{display:flex;align-items:center;justify-content:space-between;gap:12px;position:relative;}
.nx-card-label{color:#a5c0b2;display:inline-flex;align-items:center;gap:9px;}
.nx-small-orb{width:7px;height:7px;background:#b0fed0;border-radius:50%;box-shadow:0 0 0 4px #8dffc01c;}
.nx-status-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid #426553;border-radius:100px;color:#c2f5d5;background:#183127;font-size:11px;font-weight:700;white-space:nowrap;}
.nx-status-muted{border-color:#48524d;background:#262c2a;color:#bcc8c1;}
.nx-status-neutral{border-color:#695a37;background:#3f3324;color:#efdda9;}
.nx-status-indicator{width:6px;height:6px;border-radius:50%;background:currentColor;}
.nx-current-main{display:flex;align-items:center;gap:16px;margin-top:39px;z-index:1;}
.nx-plan-symbol{width:57px;height:57px;border-radius:17px;background:linear-gradient(145deg,#b5f7cd,#5caf84);color:#15231b;display:grid;place-items:center;box-shadow:0 12px 32px #7affbc15;flex:none;}
.nx-muted-upper{font-size:11px;font-weight:700;color:#a6b7af;letter-spacing:.08em;text-transform:uppercase;}
.nx-current-details h2{font-size:clamp(34px,4vw,54px);font-weight:800;letter-spacing:-.065em;line-height:1.05;margin:4px 0 0;color:#fbfff9;}
.nx-plan-period{font-size:15px;font-weight:500;letter-spacing:0;color:#9caf9f;vertical-align:middle;}
.nx-current-summary{color:#becbc2;font-size:14px;line-height:1.6;max-width:480px;margin:19px 0 23px;z-index:1;}
.nx-current-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid #49605168;padding-top:18px;margin-top:auto;z-index:1;}
.nx-current-meta{display:flex;align-items:center;gap:10px;font-size:12px;color:#a7bbad;min-width:0;}
.nx-current-meta svg{flex:none;color:#b6eac8;}
.nx-inline-action{border:0;color:#cbf9dc;background:transparent;font-size:12px;font-weight:750;display:inline-flex;align-items:center;gap:5px;padding:0;}
.nx-inline-action:hover{text-decoration:underline;}
.nx-usage-card{background:linear-gradient(145deg,#171b1f,#13171a);padding:23px 25px 18px;min-height:317px;}
.nx-usage-card .nx-section-eyebrow{color:#9cb5aa;}
.nx-usage-card h2{font-size:19px;font-weight:740;line-height:1.2;letter-spacing:-.03em;margin:9px 0 19px;color:#f0f5f1;}
.nx-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.nx-metric{padding:13px 14px;border-radius:12px;border:1px solid #30373a;background:#191e22;min-width:0;}
.nx-metric-row{display:flex;align-items:center;gap:8px;min-width:0;}
.nx-metric-label{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#b5c0bf;}
.nx-metric-icon{width:25px;height:25px;border:1px solid #3a4844;border-radius:7px;background:#25322e;color:#b0eac7;display:grid;place-items:center;flex:none;}
.nx-metric-value{font-size:24px;letter-spacing:-.06em;font-weight:760;color:#f5f9f6;margin:10px 0 9px;line-height:1.1;}
.nx-metric-value span{font-size:13px;font-weight:550;letter-spacing:-.02em;color:#83918a;}
.nx-progress-track{width:100%;height:4px;background:#30383a;border-radius:8px;overflow:hidden;}
.nx-progress-fill{height:100%;background:linear-gradient(90deg,#78dba9,#b7f5d1);border-radius:8px;transition:width .45s ease;min-width:0;}
.nx-progress-over{background:linear-gradient(90deg,#edaa64,#f5d083);}
.nx-usage-foot{font-size:10px;display:flex;align-items:center;gap:7px;color:#8b9b95;margin-top:14px;line-height:1.4;}
.nx-usage-foot svg{color:#a5d6ba;flex:none;}
.nx-pricing-section{margin-top:47px;}
.nx-pricing-head{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-bottom:23px;}
.nx-pricing-head h2{color:#f8fbf9;font-size:clamp(25px,2.8vw,34px);line-height:1.1;margin:10px 0 8px;font-weight:770;letter-spacing:-.055em;}
.nx-pricing-head p{margin:0;color:#99a49f;font-size:13px;line-height:1.6;}
.nx-cycle{border:1px solid #343b3c;border-radius:12px;display:inline-flex;padding:5px;gap:3px;background:#1c2023;flex:none;}
.nx-cycle button{color:#a5adaa;background:transparent;border:0;border-radius:8px;padding:10px 15px;font-size:12px;font-weight:750;display:flex;align-items:center;gap:7px;white-space:nowrap;}
.nx-cycle .nx-cycle-active{color:#171e1a;background:#b8f0cc;box-shadow:0 3px 8px #0002;}
.nx-saving{font-size:10px;color:#90e3b3;background:#243f30;border-radius:5px;padding:3px 5px;}
.nx-cycle-active .nx-saving{color:#21452d;background:#82caa1;}
.nx-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;align-items:stretch;}
.nx-price-card{position:relative;min-width:0;border:1px solid #31383b;background:linear-gradient(155deg,#1a1e21,#111518);border-radius:17px;transition:transform .2s,border-color .2s,box-shadow .2s;display:flex;flex-direction:column;}
.nx-price-card:hover{transform:translateY(-4px);border-color:#586f61;box-shadow:0 20px 60px #0005;}
.nx-price-pro{background:linear-gradient(145deg,#1d2b23,#131b17 55%,#111816);border-color:#79b993;box-shadow:inset 0 0 0 1px #90e5ae0e;}
.nx-price-business{background:linear-gradient(145deg,#20202b,#14151b);border-color:#3c3d4a;}
.nx-price-current:not(.nx-price-pro){border-color:#657b71;}
.nx-price-card-inner{padding:26px 24px 23px;display:flex;flex:1;flex-direction:column;min-height:355px;}
.nx-popular{position:absolute;top:-12px;left:23px;display:inline-flex;align-items:center;gap:6px;font-size:9px;font-weight:850;letter-spacing:.13em;color:#193020;background:#b8f3cf;border:1px solid #d5ffe4;padding:6px 11px;border-radius:6px;box-shadow:0 5px 21px #85feb529;}
.nx-price-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.nx-tier-name{font-size:16px;letter-spacing:-.02em;font-weight:760;color:#ecf2ed;}
.nx-tier-mark{height:32px;width:32px;border:1px solid #3a4740;border-radius:10px;display:grid;place-items:center;background:#25312a;color:#aceac4;}
.nx-price-business .nx-tier-mark{background:#302d3d;border-color:#474257;color:#c8bdf9;}
.nx-price-amount{min-height:65px;margin-top:25px;display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;}
.nx-price-amount strong,.nx-free-price{font-size:clamp(33px,3vw,42px);line-height:1;letter-spacing:-.06em;font-weight:800;color:#f9fcf9;}
.nx-price-amount > span:not(.nx-free-price){color:#91a099;font-size:12px;font-weight:550;}
.nx-price-sub{font-size:12px;color:#aeb9b2;margin:0 0 25px;line-height:1.55;min-height:38px;}
.nx-features-title{border-top:1px solid #323a3a;padding-top:21px;color:#9baea1;letter-spacing:.16em;font-size:9px;margin-bottom:14px;}
.nx-features{display:grid;gap:13px;margin-bottom:28px;}
.nx-features > div{display:flex;align-items:flex-start;gap:10px;color:#c8d1ce;font-size:12px;line-height:1.38;}
.nx-feature-check{flex:none;height:17px;width:17px;display:grid;place-items:center;background:#294432;color:#b6f0c9;border-radius:50%;}
.nx-price-business .nx-feature-check{background:#3a354c;color:#d0bbff;}
.nx-price-cta{margin-top:auto;}
.nx-action-primary,.nx-action-secondary,.nx-action-current,.nx-action-muted{min-height:43px;width:100%;border-radius:10px;display:flex;justify-content:center;align-items:center;gap:9px;padding:11px 10px;font-size:12px;font-weight:800;}
.nx-action-primary{border:1px solid #b5f3cc;color:#17271c;background:#b7f3cf;box-shadow:0 8px 35px #91f2b822;transition:transform .2s,background .2s;}
.nx-action-primary:hover{background:#d1ffe0;transform:translateY(-1px);}
.nx-action-secondary{background:#292f31;color:#f0f4f1;border:1px solid #424c4b;transition:border-color .2s,background .2s;}
.nx-action-secondary:hover{background:#343e3a;border-color:#708d78;}
.nx-action-current{border:1px solid #3a5846;color:#b5e9c7;background:#25372b;}
.nx-action-muted{color:#8e9a94;font-weight:650;text-align:center;}
.nx-footer{margin-top:29px;display:flex;align-items:center;gap:12px;background:#151a1c;border:1px solid #2e3535;border-radius:13px;padding:16px 20px;}
.nx-footer-icon{display:grid;place-items:center;width:33px;height:33px;border:1px solid #3a4b40;border-radius:10px;background:#223128;color:#b3e7c6;flex:none;}
.nx-footer strong{display:block;color:#d8e2dc;font-size:12px;margin-bottom:3px;}
.nx-footer span:not(.nx-footer-right){display:block;color:#899791;font-size:11px;}
.nx-footer-right{display:flex;gap:7px;align-items:center;margin-left:auto;color:#70897a;font-size:9px;letter-spacing:.14em;font-weight:800;white-space:nowrap;}
@media (max-width:1120px){.nx-overview-grid{grid-template-columns:1fr}.nx-usage-card{min-height:auto}.nx-current-card{min-height:270px}.nx-plan-grid{gap:11px}.nx-price-card-inner{padding:24px 18px 20px}.nx-price-amount strong,.nx-free-price{font-size:34px}}
@media (max-width:820px){.nx-plan-grid{grid-template-columns:1fr}.nx-price-card-inner{min-height:auto}.nx-price-sub{min-height:0}.nx-pricing-head{align-items:flex-start;flex-direction:column}.nx-cycle{align-self:stretch}.nx-cycle button{flex:1;justify-content:center}.nx-price-amount{min-height:56px}.nx-features{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 15px}}
@media (max-width:560px){.nx-billing{padding-bottom:32px}.nx-head{align-items:stretch;flex-direction:column;gap:19px}.nx-refresh{align-self:flex-start}.nx-head h1{font-size:32px}.nx-environment{align-items:flex-start}.nx-current-card{padding:20px 18px;min-height:280px}.nx-card-top{align-items:flex-start;flex-direction:column}.nx-current-main{margin-top:26px}.nx-current-details h2{font-size:42px}.nx-current-footer{flex-direction:column;align-items:flex-start}.nx-usage-card{padding:20px 16px}.nx-metrics{gap:8px}.nx-metric{padding:11px}.nx-metric-label{font-size:10px}.nx-pricing-section{margin-top:36px}.nx-price-card-inner{padding:24px 20px}.nx-footer-right{display:none}.nx-features{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.nx-billing *, .nx-billing *::before,.nx-billing *::after{animation:none!important;transition:none!important}}
`;
