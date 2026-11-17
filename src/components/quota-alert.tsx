'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/provider';
import { usageCopy } from '@/lib/billing/usage-copy';
import { invalidateLimits, loadLimits } from '@/lib/billing/client-snapshot';

type Meter = { used: number; limit: number };
type Snapshot = { tier?: 'free' | 'pro' | 'business'; usage?: {
  telegramAccounts: Meter; activeGroups: Meter; monthlySends: Meter; pendingSchedules: Meter;
} };
export function QuotaAlert({ userKey = 'current' }: { userKey?: string }) {
  const {locale} = useLanguage();
  const pathname = usePathname();
  const words = usageCopy(locale);
  const [snapshot,setSnapshot] = useState<Snapshot>();
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const json = await loadLimits(userKey) as Snapshot;
        if (live) setSnapshot(json as Snapshot);
      } catch { /* Do not show stale or invented metrics. */ }
    };
    void refresh();
    const billingUpdated = () => { invalidateLimits(); void refresh(); };
    window.addEventListener('focus',refresh);
    window.addEventListener('nashra:billing-updated', billingUpdated);
    return () => { live=false; window.removeEventListener('focus',refresh); window.removeEventListener('nashra:billing-updated', billingUpdated); };
  },[pathname,userKey]);
  const usage = snapshot?.usage;
  if (!usage) return null;
  const freeSends = snapshot?.tier === 'free' && usage.monthlySends.limit > 0 && usage.monthlySends.used >= Math.ceil(usage.monthlySends.limit * .8);
  const sendLimitReached = freeSends && usage.monthlySends.used >= usage.monthlySends.limit;
  const rows: {key:string;label:string;meter:Meter}[] = [
    {key:'groups',label:words.groups,meter:usage.activeGroups},
    {key:'sends',label:words.sends,meter:usage.monthlySends},
    {key:'pending',label:words.pending,meter:usage.pendingSchedules},
    {key:'accounts',label:words.accounts,meter:usage.telegramAccounts},
  ];
  const threshold = rows.filter(x => x.meter.limit>0 && x.meter.used/x.meter.limit>=0.8);
  if ((!threshold.length && !freeSends) || pathname === '/abonnement') return null;
  if (freeSends) {
    const {used,limit} = usage.monthlySends;
    return <aside role="status" aria-label="Votre quota d'envois gratuits" style={{marginBottom:16,padding:'14px 17px',border:'1px solid #416e51',background:'#19231e',borderRadius:12,display:'flex',gap:16,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
      <div><strong>{sendLimitReached ? 'Vos envois gratuits sont épuisés' : `Plus que ${Math.max(0,limit-used)} envoi(s) gratuit(s) ce mois-ci`}</strong>
        <div style={{fontSize:13,opacity:.85,marginTop:4}}>{used}/{limit} envois réservés · Passez à Pro pour 1 000 envois/mois.</div></div>
      <Link href="/abonnement?checkout=pro&interval=month" className="btn btn-primary">Passer à Pro — 8 $/mois</Link>
    </aside>;
  }
  const full = threshold.some(x => x.meter.used>=x.meter.limit);
  return <aside role="status" style={{marginBottom:16,padding:'12px 16px',border:'1px solid #52525b',borderRadius:12,display:'flex',gap:14,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
    <div><strong>{full ? words.reached : words.near}</strong>
      <div style={{fontSize:13,opacity:.85}}>{threshold.map(x=>`${x.label}: ${x.meter.used}/${x.meter.limit}`).join(' · ')}</div></div>
    <Link href="/abonnement" className="btn btn-secondary">{words.upgrade}</Link>
  </aside>;
}
