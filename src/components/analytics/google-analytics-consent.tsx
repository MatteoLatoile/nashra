'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GA_CONSENT_KEY, GA_MEASUREMENT_ID, hasAnalyticsConsent } from '@/lib/analytics/events';

type Choice = 'granted' | 'denied' | null;
const scriptId = 'nashra-ga4-script';

function readChoice(): Choice {
  try {
    const value = localStorage.getItem(GA_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch { return null; }
}

export function GoogleAnalyticsConsent() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<Choice>('denied');
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { setChoice(readChoice()); setReady(true); }, []);

  useEffect(() => {
    if (!ready || choice !== 'granted' || !hasAnalyticsConsent()) return;
    if (document.getElementById(scriptId)) {
      setLoaded(true);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: unknown[]) => { window.dataLayer?.push(args); };
    window.gtag('js', new Date());
    // Page views are sent by the pathname effect below (never include query strings).
    window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false, anonymize_ip: true });
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    script.onload = () => setLoaded(true);
    script.onerror = () => setLoaded(false);
    document.head.appendChild(script);
  }, [choice, ready]);

  useEffect(() => {
    if (!loaded || choice !== 'granted' || !hasAnalyticsConsent() || !window.gtag) return;
    window.gtag('event', 'page_view', {
      page_location: `${window.location.origin}${pathname || '/'}`,
      page_path: pathname || '/',
      page_title: document.title,
    });
  }, [pathname, choice, loaded]);

  function choose(next: Exclude<Choice, null>) {
    try { localStorage.setItem(GA_CONSENT_KEY, next); } catch { /* noop */ }
    setChoice(next);
    setSettingsOpen(false);
    if (next === 'granted' && window.gtag) {
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
    }
    if (next === 'denied' && window.gtag) {
      // GA consent withdrawal: stop future hits, and remove GA cookies from this domain.
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
      setLoaded(false);
      for (const name of document.cookie.split(';').map(v => v.split('=')[0].trim())) {
        if (name === '_ga' || name.startsWith('_ga_')) {
          document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
        }
      }
    }
  }

  if (!ready) return null;
  const isFrench = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr');
  const t = isFrench ? {
    heading: 'Mesure d’audience', body: 'Nashra utilise Google Analytics uniquement avec votre accord pour mesurer les visites et améliorer le site. Vous pouvez refuser ou changer d’avis à tout moment.',
    yes: 'Accepter', no: 'Refuser', manage: 'Confidentialité',
  } : {
    heading: 'Website analytics', body: 'Nashra uses Google Analytics only with your permission to measure visits and improve the website. You can decline or change your choice at any time.',
    yes: 'Accept', no: 'Decline', manage: 'Privacy',
  };
  const show = choice === null || settingsOpen;
  return <>
    {show && <aside role="dialog" aria-label={t.heading} style={{position:'fixed',bottom:16,left:16,right:16,maxWidth:560,zIndex:9999,background:'#15201e',border:'1px solid #527c69',borderRadius:14,padding:18,boxShadow:'0 8px 36px #0009',color:'#f0f7f3',fontFamily:'system-ui,sans-serif'}}>
      <strong style={{fontSize:17}}>{t.heading}</strong>
      <p style={{fontSize:13,lineHeight:1.55,margin:'10px 0 16px'}}>{t.body}</p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <button type="button" onClick={() => choose('denied')} style={{padding:'10px 18px',borderRadius:8,border:'1px solid #8da99e',background:'transparent',color:'inherit',cursor:'pointer'}}>{t.no}</button>
        <button type="button" onClick={() => choose('granted')} style={{padding:'10px 18px',borderRadius:8,border:0,background:'#a9ddbd',color:'#122019',fontWeight:700,cursor:'pointer'}}>{t.yes}</button>
      </div>
    </aside>}
    {choice !== null && !show && <button type="button" onClick={() => setSettingsOpen(true)} style={{position:'fixed',bottom:12,left:12,zIndex:9998,background:'#17231e',color:'#e5f4e9',border:'1px solid #496c5b',borderRadius:9,padding:'6px 10px',fontSize:11,cursor:'pointer',fontFamily:'system-ui,sans-serif'}}>{t.manage}</button>}
  </>;
}
