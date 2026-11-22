'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/provider';
import Link from 'next/link';
import { ArrowUpRight, LogOut, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { invalidateLimits, loadLimits } from '@/lib/billing/client-snapshot';
import styles from './sidebar-premium.module.css';

type Tier = 'free' | 'pro' | 'business' | 'unknown';

function normalizeTier(value: unknown): Tier {
  if (value === 'free' || value === 'pro' || value === 'business') return value;
  return 'unknown';
}

// Display-only cache: never used to authorize payment or enforce quotas.
// User-scoped to avoid displaying a previous account's plan after account switching.
const PLAN_CACHE_MS = 60_000;
const FOCUS_REFRESH_MS = 30_000;
const cachedPlans = new Map<string, { tier: Tier; until: number }>();
const lastFocusRefresh = new Map<string, number>();

function savedTier(userKey: string): Tier {
  const record = cachedPlans.get(userKey);
  return record?.tier ?? 'unknown';
}

export function SidebarPlanCard({ onNavigate, userKey = 'current' }: { onNavigate?: () => void; userKey?: string }) {
  const { t } = useLanguage();
  const [tier, setTier] = useState<Tier>(() => savedTier(userKey));
  const [loading, setLoading] = useState(() => savedTier(userKey) === 'unknown');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function updatePlan(force = false) {
      const record = cachedPlans.get(userKey);
      if (!force && record && record.until > Date.now()) {
        if (active) { setTier(record.tier); setLoading(false); }
        return;
      }
      // Revalidation never replaces an already-known plan with a skeleton.
      if (active && savedTier(userKey) === 'unknown') setLoading(true);
      try {
        let nextTier = normalizeTier((await loadLimits(userKey, force)).tier);
        if (nextTier === 'unknown') {
          const response = await fetch('/api/billing/status', {
            credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          });
          if (response.ok) {
            const data: { tier?: unknown } = await response.json();
            nextTier = normalizeTier(data.tier);
          }
        }
        if (active) {
          if (nextTier !== 'unknown') {
            cachedPlans.set(userKey, { tier: nextTier, until: Date.now() + PLAN_CACHE_MS });
            setTier(nextTier);
          } else if (savedTier(userKey) === 'unknown') {
            setTier('unknown');
          }
        }
      } catch {
        // Preserve last known visual state on temporary connection failures.
        if (active && savedTier(userKey) === 'unknown') setTier('unknown');
      } finally {
        if (active) setLoading(false);
      }
    }

    // Run on account change/mount, NOT every route navigation.
    setTier(savedTier(userKey));
    setLoading(savedTier(userKey) === 'unknown');
    void updatePlan();

    const onFocus = () => {
      const now = Date.now();
      if (now - (lastFocusRefresh.get(userKey) || 0) < FOCUS_REFRESH_MS) return;
      lastFocusRefresh.set(userKey, now);
      void updatePlan(true);
    };
    const onBillingUpdated = () => {
      cachedPlans.delete(userKey);
      lastFocusRefresh.delete(userKey);
      invalidateLimits();
      // Keep the previous visible tier while the authoritative response arrives.
      void updatePlan(true);
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('nashra:billing-updated', onBillingUpdated);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('nashra:billing-updated', onBillingUpdated);
    };
  }, [userKey]);

  const label = tier === 'business' ? 'Business' : tier === 'pro' ? 'Pro' : tier === 'free' ? 'Gratuit' : '—';
  const description = tier === 'unknown' ? 'Consulter mon abonnement' : tier === 'free' ? 'Découvrir les offres' : 'Abonnement actif';
  const tone = tier === 'business' ? styles.planBusiness : tier === 'pro' ? styles.planPro : tier === 'free' ? styles.planFree : styles.planUnknown;

  return (
    <Link href="/abonnement" onClick={onNavigate} className={`${styles.planCard} ${tone}`} aria-label={`Mon forfait : ${label}. Voir mon abonnement.`}>
      <span className={styles.planUpper}>
        <span className={styles.planCaption}>{t('MON FORFAIT')}</span>
        <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={styles.planContent}>
        {loading && tier === 'unknown' ? <span className={styles.planLoading} aria-label="Chargement du forfait" /> : <span className={styles.planName}>{label}</span>}
        {(tier === 'pro' || tier === 'business') && <Sparkles className={styles.planSparkle} size={21} strokeWidth={1.65} aria-hidden="true" />}
      </span>
      <span className={styles.planDescription}>{t(description)}</span>
    </Link>
  );
}

function fullName(metadata: Record<string, unknown>): string {
  const first = [metadata.first_name, metadata.given_name].find(v => typeof v === 'string' && v.trim());
  const last = [metadata.last_name, metadata.family_name].find(v => typeof v === 'string' && v.trim());
  const combined = [first, last].filter((v): v is string => typeof v === 'string').join(' ').trim();
  const primary = [metadata.full_name, metadata.name].find(v => typeof v === 'string' && v.trim());
  return (typeof primary === 'string' ? primary : combined).trim();
}

export function SidebarUser({
  userEmail,
  cloudMode,
  signingOut,
  onSignOut,
  onNavigate,
}: {
  userEmail?: string;
  cloudMode: boolean;
  signingOut: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(userEmail || '');

  useEffect(() => {
    if (!cloudMode) return;
    let active = true;
    async function refreshProfile() {
      try {
        const { data } = await createClient().auth.getSession();
        if (!active || !data.session?.user) return;
        setName(fullName(data.session?.user.user_metadata || {}));
        setEmail(data.session?.user.email || userEmail || '');
      } catch { /* Keep the current user label when offline. */ }
    }
    void refreshProfile();
    window.addEventListener('nashra:profile-updated', refreshProfile);
    return () => {
      active = false;
      window.removeEventListener('nashra:profile-updated', refreshProfile);
    };
  }, [cloudMode, userEmail]);

  const displayName = cloudMode ? (name || 'Compléter mon profil') : 'Mon compte';
  const initials = name
    ? name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
    : 'N';

  return (
    <div className={styles.userPanel}>
      <Link href="/profil" onClick={onNavigate} className={styles.userLink} title={name ? `Profil de ${name}` : 'Compléter mon profil'}>
        <span className={styles.userAvatar} aria-hidden="true">{initials}</span>
        <span className={styles.userText}>
          <strong title={displayName}>{displayName}</strong>
          <small title={email || undefined}>{cloudMode ? (email || 'Mon profil') : 'Session locale'}</small>
        </span>
      </Link>
      {cloudMode && (
        <button type="button" className={styles.logout} title="Se déconnecter" aria-label="Se déconnecter" onClick={onSignOut} disabled={signingOut}>
          <LogOut size={17} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
