'use client';
import { AccountMenu } from '@/components/account-menu';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Files, UsersRound, CalendarRange, History, Send, Settings2, HelpCircle, ChevronDown, Menu, X, ArrowUpRight, Command, LogOut, Cloud, CloudOff, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/lib/store';
import { NotificationCenter } from '@/components/notification-center';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { useConfirm } from '@/components/confirm-dialog';
import { useLanguage } from '@/lib/i18n/provider';

const menu = [
  { label: 'Vue d’ensemble', href: '/', Icon: LayoutGrid },
  { label: 'Mes annonces', href: '/annonces', Icon: Files },
  { label: 'Telegram', href: '/telegram', Icon: Send },
  { label: 'Destinations', href: '/groupes', Icon: UsersRound },
  { label: 'Calendrier', href: '/campagnes', Icon: CalendarRange },
  { label: 'Historique', href: '/historique', Icon: History },
];

export function Shell({ children, userEmail }: { children: React.ReactNode; userEmail?: string }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const { toast, ready, cloudMode, syncStatus, syncError, retrySync } = useApp();
  const confirm = useConfirm();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    if (syncStatus === 'saving' && !await confirm({
      title: 'Quitter pendant la sauvegarde ?',
      description: 'Vos dernières modifications sont encore en cours de synchronisation avec le cloud.',
      note: 'Attendre la fin de la sauvegarde évite de perdre des modifications récentes.',
      confirmText: 'Quitter quand même',
      tone: 'warning',
    })) return;
    setSigningOut(true);
    try { await createSupabaseClient().auth.signOut(); router.replace('/connexion'); router.refresh(); }
    finally { setSigningOut(false); }
  }
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = pathname === '/profil' ? 'Mon profil' : menu.find(x => x.href === pathname)?.label ?? 'Paramètres';
  return <div className="app-root">
    {mobileOpen && <button className="mobile-overlay" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <Link href="/" className="brand" onClick={() => setMobileOpen(false)}>
          <span className="brand-icon"><Image src="/nashra-mark.png" alt="" width={34} height={34} priority /></span>
          <span className="brand-name">nashra<span className="brand-period">.</span></span>
        </Link>
        <button className="mob-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Fermer"><X size={19}/></button>
      </div>
      <div className="workspace-switch">
        <span className="workspace-avatar">N</span>
        <span className="workspace-text"><strong>Mon espace</strong><small>{cloudMode ? "Synchronisé · Privé" : "Démonstration locale"}</small></span>
        <ChevronDown size={15} className="muted" />
      </div>
      <div className="sidebar-label">ESPACE DE TRAVAIL</div>
      <nav className="nav-list" aria-label="Navigation principale">
        {menu.map(({ label, href, Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-item ${pathname === href ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={1.8}/><span>{t(label)}</span>{href === '/campagnes' && <span className="nav-pin"/>}</Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-label">GÉNÉRAL</div>
        
        <Link href="/parametres" onClick={() => setMobileOpen(false)} className={`nav-item ${pathname === '/parametres' ? 'nav-active' : ''}`}><Settings2 size={18}/><span>Paramètres</span></Link>
        <a href="https://core.telegram.org/api" target="_blank" rel="noreferrer" className="nav-item"><HelpCircle size={18}/><span>Documentation Telegram</span><ArrowUpRight className="nav-external" size={14}/></a>
        <div className="sidebar-plan">
          <div className="plan-header"><span className="plan-icon"><Command size={15}/></span><span>{cloudMode ? 'Espace cloud' : 'Démo locale'}</span></div>
          <p>{cloudMode ? 'Votre contenu est lié à votre compte Supabase personnel.' : 'Ajoutez Supabase pour activer les comptes et le cloud.'}</p>
          <div className="plan-meter"><i/></div>
          <span className="plan-caption">{cloudMode ? 'Chaque compte dispose de ses propres données.' : 'Mode démonstration, sans connexion.'}</span>
        </div>
        <div className="user-profile"><span className="user-avatar">N</span><span className="user-name"><strong>{cloudMode ? 'Mon compte' : 'Démo'}</strong><small title={userEmail}>{cloudMode ? (userEmail ?? 'Connecté') : 'Administrateur local'}</small></span>{cloudMode ? <button className="logout-button" title="Se déconnecter" aria-label="Se déconnecter" onClick={() => void signOut()} disabled={signingOut}><LogOut size={18}/></button> : <span className="online-indicator"/>}</div>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <div className="top-left"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu size={20}/></button><span className="crumb">Mon espace</span><span className="crumb-slash">/</span><span className="crumb-current">{t(pageTitle)}</span></div>
        <div className="top-right"><span title={syncError || undefined} className={`environment-pill ${syncStatus === 'error' ? 'sync-pill-error' : ''}`}>
        {syncStatus === 'saving' || syncStatus === 'loading' ? <LoaderCircle size={13} className="tg-spin"/> : syncStatus === 'error' ? <CloudOff size={13}/> : syncStatus === 'synced' ? <Cloud size={13}/> : <span className="env-dot"/>}
        {syncStatus === 'saving' ? 'Enregistrement…' : syncStatus === 'loading' ? 'Chargement…' : syncStatus === 'synced' ? 'Cloud synchronisé' : syncStatus === 'error' ? 'Erreur de sauvegarde' : 'Démo locale'}</span>
        {syncStatus === 'error' && <button onClick={retrySync} className="sync-retry" title={syncError || 'Réessayer'}>Réessayer</button>}<span className="top-separator"/><NotificationCenter userEmail={userEmail} /><AccountMenu userEmail={userEmail} onSignOut={() => void signOut()} /></div>
      </header>
      <main className="main-content">{ready ? children : <div className="page-loader"><div className="loading-orb"/>Préparation de Nashra…</div>}</main>
    </div>
    {toast && <div role="status" className="toast"><span className="toast-dot"/>{toast}</div>}
  </div>;
}
