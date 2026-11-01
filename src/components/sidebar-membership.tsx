'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, LogOut, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './sidebar-premium.module.css';

type Tier = 'free' | 'pro' | 'business' | 'unknown';

function normalizeTier(value: unknown): Tier {
  if (value === 'free' || value === 'pro' || value === 'business') return value;
  return 'unknown';
}

export function SidebarPlanCard({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [tier, setTier] = useState<Tier>('unknown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function updatePlan() {
      if (mounted) setLoading(true);
      try {
        let nextTier: Tier = 'unknown';
        const res = await fetch('/api/billing/limits', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (res.ok) {
          const data: { tier?: unknown } = await res.json();
          nextTier = normalizeTier(data.tier);
        }
        // The status route provides a fallback if the quota snapshot is unavailable.
        if (nextTier === 'unknown') {
          const status = await fetch('/api/billing/status', {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (status.ok) {
            const data: { tier?: unknown } = await status.json();
            nextTier = normalizeTier(data.tier);
          }
        }
        if (mounted) setTier(nextTier);
      } catch {
        if (mounted && !controller.signal.aborted) setTier('unknown');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void updatePlan();
    // Keep the badge up to date after Checkout, profile navigation or tab focus.
    window.addEventListener('focus', updatePlan);
    window.addEventListener('nashra:billing-updated', updatePlan);
    return () => {
      mounted = false;
      controller.abort();
      window.removeEventListener('focus', updatePlan);
      window.removeEventListener('nashra:billing-updated', updatePlan);
    };
  }, [pathname]);

  const label = tier === 'business' ? 'Business' : tier === 'pro' ? 'Pro' : tier === 'free' ? 'Gratuit' : '—';
  const description = tier === 'unknown' ? 'Consulter mon abonnement' : tier === 'free' ? 'Découvrir les offres' : 'Abonnement actif';
  const tone = tier === 'business' ? styles.planBusiness : tier === 'pro' ? styles.planPro : tier === 'free' ? styles.planFree : styles.planUnknown;

  return (
    <Link href="/abonnement" onClick={onNavigate} className={`${styles.planCard} ${tone}`} aria-label={`Mon forfait : ${label}. Voir mon abonnement.`}>
      <span className={styles.planUpper}>
        <span className={styles.planCaption}>MON FORFAIT</span>
        <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={styles.planContent}>
        {loading ? <span className={styles.planLoading} aria-label="Chargement du forfait" /> : <span className={styles.planName}>{label}</span>}
        {(tier === 'pro' || tier === 'business') && <Sparkles className={styles.planSparkle} size={21} strokeWidth={1.65} aria-hidden="true" />}
      </span>
      <span className={styles.planDescription}>{description}</span>
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
        const { data } = await createClient().auth.getUser();
        if (!active || !data.user) return;
        setName(fullName(data.user.user_metadata || {}));
        setEmail(data.user.email || userEmail || '');
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
