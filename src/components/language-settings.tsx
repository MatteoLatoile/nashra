'use client';

import { Globe2, Languages, CheckCircle2, LoaderCircle } from 'lucide-react';
import { LANGUAGES } from '@/lib/i18n';
import { useLanguage } from '@/lib/i18n/provider';

export function LanguageSettingsCard() {
  const { choice, device, locale, chooseLanguage, saving, saveError, t } = useLanguage();
  const deviceName = LANGUAGES.find(lang => lang.code === device)?.native || 'English';
  return <section className="nashra-language-card" id="langue" aria-label={t('Langue de l’interface')}>
    <div className="nashra-language-heading">
      <div className="nashra-language-icon"><Globe2 size={22} strokeWidth={1.7}/></div>
      <div><h2>{t('Langue de l’interface')}</h2><p>{t('Choisissez la langue utilisée dans Nashra.')}</p></div>
      <span className="nashra-language-tag"><Languages size={14}/>{LANGUAGES.length}</span>
    </div>
    <div className="nashra-language-row">
      <label htmlFor="nashra-preferred-language">{t('Langue')}</label>
      <select id="nashra-preferred-language" dir="auto" value={choice}
        onChange={event => void chooseLanguage(event.target.value as typeof choice)}
        data-nashra-i18n-ignore="true">
        <option value="auto">{t('Détection automatique')} ({deviceName})</option>
        {LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.native}</option>)}
      </select>
    </div>
    <p className="nashra-language-explain">{t('Au premier lancement, Nashra utilise la langue de votre appareil.')}
      {' '}{t('Votre préférence sera mémorisée dans votre compte.')}</p>
    <div className="nashra-language-status" role="status" aria-live="polite">
      {saving ? <><LoaderCircle size={15} className="tg-spin"/>{t('Enregistrement…')}</> :
        saveError ? <span className="nashra-language-error">{saveError}</span> :
        <><CheckCircle2 size={15}/>{t('Langue enregistrée')} · {LANGUAGES.find(item => item.code === locale)?.native}</>}
    </div>
  </section>;
}
