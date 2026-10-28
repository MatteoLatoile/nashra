'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Megaphone, UsersRound, CalendarCheck2, Send, Plus, TrendingUp, Files, Clock3, CircleCheck, Layers3, ChevronRight, CalendarDays, Workflow, ShieldCheck } from 'lucide-react';
import { Badge, DemoNotice, PageHeader, SectionHead } from '@/components/ui';
import { dateFR, timeFR, useApp } from '@/lib/store';

export default function Dashboard() {
  const { data } = useApp();
  const nextSlot = (c: (typeof data.campaigns)[number]) =>
    (c.scheduledDates?.length ? c.scheduledDates : [c.scheduledAt])
      .filter(at => Date.parse(at) > Date.now()).sort()[0];
  const scheduled = data.campaigns.filter(c => c.status === 'scheduled' && nextSlot(c))
    .sort((a, b) => Date.parse(nextSlot(a)!) - Date.parse(nextSlot(b)!));
  const allowed = data.destinations.filter(d => d.authorized).length;
  const windowStart = Date.now() - 7 * 86400000;
  const lastWeekActions = data.activity.filter(a => Date.parse(a.createdAt) >= windowStart);
  const publicationsWeek = lastWeekActions.filter(a => a.title === 'Publication Telegram effectuée').length;
  const pending = data.campaigns.filter(c => c.status === 'scheduled' &&
    (c.scheduledDates?.length ? c.scheduledDates : [c.scheduledAt]).some(d => Date.parse(d) < Date.now())).length;
  const checkpoints = [
    { label: 'Bibliothèque', detail: `${data.announcements.length} annonce(s) enregistrée(s)`, ready: data.announcements.length > 0, href: '/annonces' },
    { label: 'Destinations autorisées', detail: `${allowed} destination(s) confirmée(s)`, ready: allowed > 0, href: '/groupes' },
    { label: 'Planification', detail: `${scheduled.length} campagne(s) à venir`, ready: scheduled.length > 0, href: '/campagnes' },
  ];
  const stats = [
    { label: 'Annonces enregistrées', value: data.announcements.length, Icon: Files, detail: 'Dans votre bibliothèque' },
    { label: 'Destinations autorisées', value: allowed, Icon: UsersRound, detail: `${data.destinations.length} groupes enregistrés` },
    { label: 'Campagnes planifiées', value: scheduled.length, Icon: CalendarCheck2, detail: 'Planifications non exécutées' },
    { label: 'Publications réelles', value: data.activity.filter(a => a.title === 'Publication Telegram effectuée').length, Icon: Send, detail: 'Envois manuels depuis votre compte' },
  ];
  return <>
    <PageHeader eyebrow="NASHRA · VOTRE ESPACE" title="Vue d’ensemble" description="Bienvenue sur Nashra. Un seul endroit pour organiser votre diffusion." actions={<Link className="btn btn-primary" href="/campagnes?nouveau=1"><Plus size={17}/> Nouvelle campagne</Link>}/>
    <div className="welcome-banner">
      <div className="welcome-copy"><div className="banner-mini"><span className="banner-mini-dot"/> VOTRE CENTRE DE CONTRÔLE</div><h2>Publiez intelligemment.<br/><span>Restez organisé.</span></h2><p>Vos annonces, vos groupes et votre calendrier réunis dans un espace simple, pensé pour gagner du temps.</p><Link href="/annonces" className="banner-link">Explorer ma bibliothèque <ArrowUpRight size={17}/></Link></div>
      <div className="banner-art" aria-hidden="true"><div className="art-ring ring-1"/><div className="art-ring ring-2"/><div className="art-ring ring-3"/><div className="art-center"><span className="art-n">N</span></div><span className="art-dot dot-a"/><span className="art-dot dot-b"/><span className="art-dot dot-c"/><span className="art-plus plus-a">+</span><span className="art-plus plus-b">+</span></div>
    </div>
    <div className="stats-grid">{stats.map(({label,value,Icon,detail}) => <div className="stat-card" key={label}><div className="stat-upper"><span>{label}</span><div className="stat-icon"><Icon size={18}/></div></div><strong className="stat-value">{value.toString().padStart(2,'0')}</strong><div className="stat-detail"><span className="small-dot"/> {detail}</div></div>)}</div>
    <div className="n20-dash-checks" aria-label="État de votre espace Nashra">
      <div className="n20-dash-checks-head"><h2>État de votre espace</h2><span>{checkpoints.filter(x => x.ready).length} / {checkpoints.length} étapes prêtes</span></div>
      <div className="n20-check-grid">{checkpoints.map(item => <Link key={item.label} href={item.href} className={`n20-check-item${item.ready ? ' n20-done' : ''}`}>
        {item.ready ? <CircleCheck size={21}/> : <ArrowUpRight size={21}/>}
        <span><strong>{item.label}</strong><small>{item.detail}</small></span>
      </Link>)}</div>
      <div className="n20-dashboard-events"><div><strong>Activité des 7 derniers jours</strong><small>{lastWeekActions.length} action(s), dont {publicationsWeek} publication(s) manuelle(s)</small></div>
        <div><strong>Campagnes nécessitant une revue</strong><small>{pending} campagne(s) avec au moins un créneau passé · <Link href="/campagnes">Ouvrir le calendrier ↗</Link></small></div></div>
    </div>
    <DemoNotice compact />
    <div className="dashboard-columns"><section className="content-panel"><SectionHead title="Prochaines campagnes" link="/campagnes" linkText="Gérer les campagnes"/><p className="section-subtitle">Votre programme à venir, en un coup d’œil.</p>
      {scheduled.length ? <div className="campaign-timeline">{scheduled.slice(0, 4).map((c,i) => { const a = data.announcements.find(a => a.id === c.announcementId); return <div className="timeline-row" key={c.id}><div className="timeline-track"><span className="timeline-bullet"/>{i < scheduled.length - 1 && <span className="timeline-line"/>}</div><div className="timeline-main"><div className="timeline-title">{c.name}<Badge tone="positive">Planifiée</Badge></div><p>{(c.announcementIds?.length ?? 1) > 1 ? `${c.announcementIds!.length} annonces` : a?.title ?? 'Annonce introuvable'} · {c.destinationIds.length} destination{c.destinationIds.length > 1 ? 's' : ''}</p><div className="timeline-meta"><CalendarDays size={14}/>{dateFR(nextSlot(c)!, {day:'numeric', month:'long'})}<span>·</span><Clock3 size={14}/>{timeFR(nextSlot(c)! )}</div></div><ChevronRight className="timeline-chevron" size={18}/></div>; })}</div> : <div className="inline-empty">Aucune campagne planifiée pour le moment.</div>}
    </section><section className="content-panel guide-panel"><SectionHead title="Bien démarrer"/><p className="section-subtitle">Trois étapes pour préparer votre espace.</p><div className="steps-list"><Link href="/annonces" className="step-row"><span className="step-icon"><Layers3 size={19}/></span><div><strong>01. Ajoutez vos annonces</strong><p>Centralisez vos textes et vos liens.</p></div><ArrowUpRight size={17}/></Link><Link href="/groupes" className="step-row"><span className="step-icon"><ShieldCheck size={19}/></span><div><strong>02. Organisez vos groupes</strong><p>Répertoriez les destinations autorisées.</p></div><ArrowUpRight size={17}/></Link><Link href="/campagnes" className="step-row"><span className="step-icon"><Workflow size={19}/></span><div><strong>03. Créez une campagne</strong><p>Préparez votre prochaine publication.</p></div><ArrowUpRight size={17}/></Link></div><div className="guide-footer"><CircleCheck size={16}/> Base prête pour les intégrations à venir.</div></section></div>
    <div className="bottom-status"><span><TrendingUp size={16}/> Nashra V2.0 · Espace et statistiques réelles</span><span><Megaphone size={15}/> Aucun envoi automatisé n’est activé <ArrowRight size={15}/></span></div>
  </>;
}
