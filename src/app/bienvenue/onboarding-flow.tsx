'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, Cloud, FileText, MessageCircle, RefreshCw, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/provider';
import { createClient } from '@/lib/supabase/client';
import { onboardingCopy } from './copy';

type Props = {
  initialStep: number;
  initialName: string;
  initialCompany: string;
  initialEmail: string;
  userId: string;
};
type TelegramState = 'checking' | 'connected' | 'not-connected' | 'error';

export function OnboardingFlow({ initialStep, initialName, initialCompany, initialEmail, userId }: Props) {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = onboardingCopy[locale] || onboardingCopy.en;
  const [step, setStep] = useState(initialStep);
  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState(initialCompany);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [telegram, setTelegram] = useState<TelegramState>('checking');
  const [announcements, setAnnouncements] = useState<number | null>(null);
  const [destinations, setDestinations] = useState<number | null>(null);
  const isRtl = locale === 'ar' || locale === 'ur';

  const checkTelegram = useCallback(async () => {
    setTelegram('checking');
    try {
      const response = await fetch('/api/telegram/user/status', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('status unavailable');
      const result: { connected?: boolean } = await response.json();
      setTelegram(result.connected ? 'connected' : 'not-connected');
    } catch {
      setTelegram('error');
    }
  }, []);

  const checkContent = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: readError } = await supabase
        .from('workspaces')
        .select('data')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) throw readError;
      const workspace = data?.data;
      setAnnouncements(Array.isArray(workspace?.announcements) ? workspace.announcements.length : 0);
      setDestinations(Array.isArray(workspace?.destinations) ? workspace.destinations.length : 0);
    } catch {
      setAnnouncements(null);
      setDestinations(null);
    }
  }, [userId]);

  useEffect(() => {
    void checkTelegram();
    void checkContent();
  }, [checkTelegram, checkContent]);

  async function saveMetadata(changes: Record<string, string | number | boolean>) {
    const { error: saveError } = await createClient().auth.updateUser({ data: changes });
    if (saveError) throw saveError;
  }

  async function advance(next: number) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await saveMetadata({
        ...(step === 0 ? { full_name: name.trim(), company_name: company.trim() } : {}),
        nashra_onboarding_step: next,
      });
      setStep(next);
      if (next === 1) void checkTelegram();
      if (next === 2) void checkContent();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function leave(path: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await saveMetadata({
        ...(step === 0 ? { full_name: name.trim(), company_name: company.trim() } : {}),
        nashra_onboarding_step: step,
        nashra_onboarding_status: 'skipped',
      });
      router.replace(path);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
      setBusy(false);
    }
  }

  async function complete() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await saveMetadata({
        full_name: name.trim(),
        company_name: company.trim(),
        nashra_onboarding_step: 3,
        nashra_onboarding_status: 'completed',
        nashra_onboarding_finished_at: new Date().toISOString(),
      });
      router.replace('/dashboard');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
      setBusy(false);
    }
  }

  const titles = [t.profile, t.telegram, t.content, t.done];
  return (
    <div className="onb-root" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="onb-shell">
        <header className="onb-header">
          <div className="onb-brand"><span className="onb-mark"><Image src="/nashra-mark.png" alt="" width={24} height={24}/></span><strong>nashra<span>.</span></strong></div>
          <div className="onb-header-meta"><ShieldCheck size={15}/><span>{initialEmail}</span></div>
        </header>
        <main className="onb-layout">
          <aside className="onb-aside">
            <div className="onb-aside-label">{t.setup}</div>
            <h1>Nashra<span>.</span></h1>
            <p>{t.welcomeDesc}</p>
            <nav aria-label={t.summary} className="onb-step-list">
              {titles.map((title, index) => (
                <div key={title} className={`onb-step ${step === index ? 'onb-step-current' : ''} ${step > index ? 'onb-step-past' : ''}`} aria-current={step === index ? 'step' : undefined}>
                  <span className="onb-step-index">{index < step ? <Check size={15} /> : String(index + 1).padStart(2, '0')}</span>
                  <span>{title}</span>
                  {step === index && <span className="onb-step-indicator" />}
                </div>
              ))}
            </nav>
            <div className="onb-aside-bottom"><Sparkles size={16} /><span>{t.close}</span></div>
          </aside>
          <section className="onb-main" aria-labelledby="onb-title">
            <div className="onb-progress-meta"><span>{t.step} {step + 1} {t.of} 4</span><span>{Math.round(((step + 1) / 4) * 100)}%</span></div>
            <div className="onb-progress-track"><span style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>
            {step === 0 && <>
              <div className="onb-main-icon"><UsersRound size={24} strokeWidth={1.7}/></div>
              <h2 id="onb-title">{t.welcome}</h2><p className="onb-lead">{t.welcomeDesc}</p>
              <form onSubmit={(e) => { e.preventDefault(); void advance(1); }} className="onb-fields">
                <label htmlFor="onb-name">{t.name}</label>
                <input id="onb-name" autoComplete="name" maxLength={100} value={name} placeholder={t.namePlaceholder} onChange={e => setName(e.target.value)}/>
                <label htmlFor="onb-company">{t.company} <span>· {t.optional}</span></label>
                <input id="onb-company" maxLength={120} value={company} placeholder={t.companyPlaceholder} onChange={e => setCompany(e.target.value)}/>
                <button className="onb-primary" type="submit" disabled={busy}>{busy ? t.saving : t.continue}<ArrowRight size={17} aria-hidden="true"/></button>
              </form>
            </>}
            {step === 1 && <>
              <div className="onb-main-icon"><MessageCircle size={24} strokeWidth={1.7}/></div>
              <h2 id="onb-title">{t.connect}</h2><p className="onb-lead">{t.connectDesc}</p>
              <div className="onb-status-box"><span className={`onb-status-light ${telegram === 'connected' ? 'onb-success-light' : ''}`}/><div><strong>{telegram === 'connected' ? t.connected : telegram === 'error' ? t.connectionUnknown : t.notConnected}</strong><small>Telegram MTProto</small></div><button type="button" onClick={() => void checkTelegram()} aria-label={t.check} title={t.check}><RefreshCw size={17} className={telegram === 'checking' ? 'onb-spin' : ''}/></button></div>
              <p className="onb-disclaimer"><ShieldCheck size={17}/>{t.telegramNote}</p>
              <div className="onb-action-row"><button className="onb-secondary" type="button" onClick={() => void leave('/telegram')} disabled={busy}>{t.openTelegram}<ChevronRight size={17}/></button></div>
            </>}
            {step === 2 && <>
              <div className="onb-main-icon"><FileText size={24} strokeWidth={1.7}/></div>
              <h2 id="onb-title">{t.prepare}</h2><p className="onb-lead">{t.prepareDesc}</p>
              <div className="onb-count-grid"><div><span>{t.announcements}</span><strong>{announcements === null ? '—' : announcements}</strong></div><div><span>{t.destinations}</span><strong>{destinations === null ? '—' : destinations}</strong></div></div>
              <div className="onb-action-row"><button className="onb-secondary" onClick={() => void leave('/annonces')} disabled={busy}><FileText size={16}/>{t.addAnnouncement}<ChevronRight size={16}/></button><button className="onb-secondary" onClick={() => void leave('/groupes')} disabled={busy}><UsersRound size={16}/>{t.manageDestinations}<ChevronRight size={16}/></button></div>
              <p className="onb-disclaimer"><ShieldCheck size={17}/>{t.groupsNote}</p>
            </>}
            {step === 3 && <>
              <div className="onb-main-icon onb-main-icon-done"><CheckCircle2 size={27} strokeWidth={1.7}/></div>
              <h2 id="onb-title">{t.finish}</h2><p className="onb-lead">{t.finishDesc}</p>
              <div className="onb-summary">
                <div><UsersRound size={17}/><span>{t.profile}</span><small>{name.trim() || company.trim() ? t.statusReady : t.statusOptional}</small></div>
                <div><MessageCircle size={17}/><span>{t.telegram}</span><small>{telegram === 'connected' ? t.statusReady : t.statusOptional}</small></div>
                <div><FileText size={17}/><span>{t.content}</span><small>{announcements !== null && announcements > 0 ? t.statusReady : t.statusOptional}</small></div>
              </div>
              <button type="button" className="onb-primary" disabled={busy} onClick={() => void complete()}>{busy ? t.saving : t.complete}<ArrowRight size={17}/></button>
            </>}
            {error && <p className="onb-error" role="alert">{error}</p>}
            <footer className="onb-footer">
              {step > 0 ? <button type="button" className="onb-text-button" disabled={busy} onClick={() => void advance(step - 1)}><ArrowLeft size={15}/>{t.back}</button> : <span/>}
              <div className="onb-footer-actions">
                {step < 3 && <button type="button" className="onb-text-button" disabled={busy} onClick={() => void leave('/dashboard')}>{t.later}</button>}
                {(step === 1 || step === 2) && <button type="button" className="onb-next" disabled={busy} onClick={() => void advance(step + 1)}>{busy ? t.saving : t.continue}<ArrowRight size={15}/></button>}
              </div>
            </footer>
          </section>
        </main>
        <div className="onb-site-footer"><Cloud size={14}/>{t.subline}<span>© Nashra</span></div>
      </div>
    </div>
  );
}
