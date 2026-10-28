'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/provider';
import { usageCopy } from '@/lib/billing/usage-copy';

type Meter = { used: number; limit: number };
type Snapshot = { usage?: {
  telegramAccounts: Meter; activeGroups: Meter; monthlySends: Meter; pendingSchedules: Meter;
} };
export function QuotaAlert() {
  const {locale} = useLanguage();
  const pathname = usePathname();
  const words = usageCopy(locale);
  const [usage,setUsage] = useState<Snapshot['usage']>();
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const res = await fetch('/api/billing/limits',{cache:'no-store'});
        if (!res.ok) return;
        const json = await res.json() as Snapshot;
        if (live) setUsage(json.usage);
      } catch { /* Do not show stale or invented metrics. */ }
    };
    void refresh();
    window.addEventListener('focus',refresh);
    return () => { live=false; window.removeEventListener('focus',refresh); };
  },[pathname]);
  if (!usage) return null;
  const rows: {key:string;label:string;meter:Meter}[] = [
    {key:'groups',label:words.groups,meter:usage.activeGroups},
    {key:'sends',label:words.sends,meter:usage.monthlySends},
    {key:'pending',label:words.pending,meter:usage.pendingSchedules},
    {key:'accounts',label:words.accounts,meter:usage.telegramAccounts},
  ];
  const threshold = rows.filter(x => x.meter.limit>0 && x.meter.used/x.meter.limit>=0.8);
  if (!threshold.length || pathname === '/abonnement') return null;
  const full = threshold.some(x => x.meter.used>=x.meter.limit);
  return <aside role="status" style={{marginBottom:16,padding:'12px 16px',border:'1px solid #52525b',borderRadius:12,display:'flex',gap:14,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
    <div><strong>{full ? words.reached : words.near}</strong>
      <div style={{fontSize:13,opacity:.85}}>{threshold.map(x=>`${x.label}: ${x.meter.used}/${x.meter.limit}`).join(' · ')}</div></div>
    <Link href="/abonnement" className="btn btn-secondary">{words.upgrade}</Link>
  </aside>;
}
