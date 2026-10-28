'use client';

import Link from 'next/link';
import { HelpCircle, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/provider';

const labels = {
  fr: 'Guide de démarrage', en: 'Getting started', ar: 'دليل البدء', ru: 'Начало работы',
  es: 'Guía de inicio', it: 'Guida introduttiva', de: 'Erste Schritte',
  id: 'Panduan awal', fil: 'Gabay sa pagsisimula', tr: 'Başlangıç rehberi', ur: 'شروعاتی رہنما',
} as const;

export function OnboardingNavLink({ onNavigate }: { onNavigate?: () => void }) {
  const { locale } = useLanguage();
  return <Link href="/bienvenue" className="nav-item" onClick={onNavigate}><HelpCircle size={18}/><span>{labels[locale]}</span></Link>;
}

export function OnboardingAccountLink({ onNavigate }: { onNavigate?: () => void }) {
  const { locale } = useLanguage();
  return <Link href="/bienvenue" role="menuitem" onClick={onNavigate}><Sparkles size={17}/><span>{labels[locale]}</span></Link>;
}
