'use client';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const DashboardTour = dynamic(() => import('./dashboard-tour').then(m => m.DashboardTour), { ssr: false });
const REPLAY_EVENT = 'nashra:dashboard-tour:replay';
const PENDING_KEY = 'nashra:dashboard-tour:replay-pending';

/** Do not download the multi-step tour for returning users who finished it. */
export function DashboardTourGate({ userEmail, ready }: { userEmail?: string; ready: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!ready || pathname !== '/dashboard' || enabled) return;
    try {
      const key = `nashra:dashboard-tour:complete:v3:${(userEmail || 'local').trim().toLowerCase()}`;
      if (sessionStorage.getItem(PENDING_KEY) === '1' || localStorage.getItem(key) === null) setEnabled(true);
    } catch { /* If storage is blocked, the manual replay action still works. */ }
  }, [ready, pathname, userEmail, enabled]);
  useEffect(() => {
    const replay = () => {
      if (enabled) return; // The mounted tour handles the replay itself.
      try { sessionStorage.setItem(PENDING_KEY, '1'); } catch { /* ignore */ }
      setEnabled(true);
      if (pathname !== '/dashboard') router.push('/dashboard');
    };
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, [enabled, pathname, router]);
  return enabled ? <DashboardTour userEmail={userEmail} ready={ready} /> : null;
}
