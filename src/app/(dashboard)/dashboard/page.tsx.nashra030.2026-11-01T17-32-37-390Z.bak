'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, CalendarClock,
  CalendarDays, CheckCircle2, Clock3, Files, Plus, RefreshCw,
  Send, ShieldCheck, UsersRound, Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { dateFR, timeFR, useApp } from '@/lib/store';
import styles from './dashboard.module.css';

type Overview = {
  migrationReady: boolean;
  publishingEnabled: boolean;
  dispatchAllowed?: boolean;
  emergencyStop?: boolean;
  recurringEnabled?: boolean;
  alerts?: { uncertain?: number; blocked?: number; stalled?: number; expired?: number };
  requiresManualReview?: number;
  nextScheduledAt?: string | null;
  partial?: boolean;
};
type Probe =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'success'; value: Overview };

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

export default function Dashboard() {
  const { data } = useApp();
  const [probe, setProbe] = useState<Probe>({ kind: 'loading' });
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setProbe({ kind: 'loading' });
    fetch('/api/automation/oversight', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Statut indisponible');
        return (await response.json()) as Overview;
      })
      .then((value) => { if (!controller.signal.aborted) setProbe({ kind: 'success', value }); })
      .catch(() => { if (!controller.signal.aborted) setProbe({ kind: 'error' }); });
    return () => controller.abort();
  }, [refreshIndex]);

  const now = Date.now();
  const nextSlot = (campaign: (typeof data.campaigns)[number]) =>
    (campaign.scheduledDates?.length ? campaign.scheduledDates : [campaign.scheduledAt])
      .filter((at) => at && Number.isFinite(Date.parse(at)) && Date.parse(at) > now)
      .sort()[0];
  const campaigns = data.campaigns
    .filter((campaign) => campaign.status === 'scheduled' && nextSlot(campaign))
    .sort((a, b) => Date.parse(nextSlot(a)!) - Date.parse(nextSlot(b)!));
  const allowed = data.destinations.filter((d) => d.authorized).length;
  const publishedCount = data.activity.filter((a) => a.title === 'Publication Telegram effectuée').length;
  const alerts = probe.kind === 'success' ? probe.value.requiresManualReview ?? 0 : null;

  const readySteps = [
    { name: 'Annonce', isReady: data.announcements.length > 0, href: '/annonces', description: 'Préparez votre premier contenu.' },
    { name: 'Destination', isReady: allowed > 0, href: '/groupes', description: 'Autorisez un groupe ou un canal.' },
    { name: 'Programmation', isReady: campaigns.length > 0, href: '/campagnes', description: 'Planifiez une publication.' },
  ];
  const readyCount = readySteps.filter((step) => step.isReady).length;
  const allReady = readyCount === readySteps.length;

  const activity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return { key: dayKey(date), label: shortDay.format(date), count: 0, publishes: 0 };
    });
    const byDay = new Map(days.map((day) => [day.key, day]));
    for (const entry of data.activity) {
      const timestamp = new Date(entry.createdAt);
      if (Number.isNaN(timestamp.getTime())) continue;
      const day = byDay.get(dayKey(timestamp));
      if (!day) continue;
      day.count += 1;
      if (entry.title === 'Publication Telegram effectuée') day.publishes += 1;
    }
    return days;
  }, [data.activity]);
  const maxActivity = Math.max(1, ...activity.map((day) => day.count));
  const activityTotal = activity.reduce((sum, day) => sum + day.count, 0);
  const activityPublishes = activity.reduce((sum, day) => sum + day.publishes, 0);

  let statusLabel = 'État en cours de vérification';
  let statusDescription = 'Lecture de la configuration de publication.';
  let statusTone: 'good' | 'warn' | 'neutral' = 'neutral';
  if (probe.kind === 'error') {
    statusLabel = 'État indisponible';
    statusDescription = 'Impossible de vérifier la configuration du moteur. Ne présumez pas que les envois sont actifs.';
    statusTone = 'warn';
  } else if (probe.kind === 'success') {
    const item = probe.value;
    if (item.emergencyStop) {
      statusLabel = 'Envois suspendus';
      statusDescription = 'Arrêt général des publications activé côté serveur.';
      statusTone = 'warn';
    } else if (!item.migrationReady) {
      statusLabel = 'Vérification technique requise';
      statusDescription = 'Le contrôle de la base de données du moteur n’est pas prêt.';
      statusTone = 'warn';
    } else if (!(item.dispatchAllowed ?? item.publishingEnabled)) {
      statusLabel = 'Envois automatiques désactivés';
      statusDescription = 'La publication automatique n’est pas autorisée par la configuration serveur.';
      statusTone = 'warn';
    } else {
      statusLabel = 'Publication autorisée côté serveur';
      statusDescription = 'Les contrôles d’activation passent. La bonne exécution du cron reste à vérifier.';
      statusTone = 'good';
    }
  }

  const metrics = [
    { title: 'Annonces', value: data.announcements.length, detail: 'Dans votre bibliothèque', icon: Files, href: '/annonces' },
    { title: 'Destinations', value: allowed, detail: 'Groupes autorisés', icon: UsersRound, href: '/groupes' },
    { title: 'Campagnes à venir', value: campaigns.length, detail: 'Créneaux prévus', icon: CalendarDays, href: '/campagnes' },
    { title: 'Publications consignées', value: publishedCount, detail: 'Dans l’historique de l’espace', icon: Send, href: '/historique' },
  ];

  return <>
    <PageHeader
      eyebrow="NASHRA / TABLEAU DE BORD"
      title="Vue d’ensemble"
      description="Vos publications, vos prochaines échéances et l’état de votre espace."
      actions={<Link className="btn btn-primary" href="/campagnes?nouveau=1"><Plus size={17}/> Nouvelle campagne</Link>}
    />

    <div className={styles.dashboard}>
      <section className={styles.topStatus} aria-label="État des automatisations">
        <div className={styles.statusLeft}>
          <div className={`${styles.statusIcon} ${styles[statusTone]}`}><Zap size={20}/></div>
          <div className={styles.statusCopy}>
            <div className={styles.eyebrow}>PUBLICATION AUTOMATIQUE</div>
            {probe.kind === 'loading' ? <span className={`${styles.skeleton} ${styles.skeletonTitle}`} aria-label="Chargement de l’état"/> : <strong>{statusLabel}</strong>}
            <p>{probe.kind === 'loading' ? 'Vérification du moteur…' : statusDescription}</p>
          </div>
        </div>
        <div className={styles.statusActions}>
          <Link href="/supervision" className={styles.textAction}>Voir la supervision <ArrowUpRight size={15}/></Link>
          <button type="button" className={styles.refreshButton} aria-label="Actualiser l’état des automatisations" onClick={() => setRefreshIndex((i) => i + 1)}><RefreshCw size={16}/></button>
        </div>
      </section>

      <section className={styles.stats} aria-label="Statistiques de votre espace">
        {metrics.map(({ title, value, detail, icon: Icon, href }) => <Link href={href} className={styles.stat} key={title}>
          <div className={styles.statTop}><span>{title}</span><Icon size={17}/></div>
          <strong>{String(value).padStart(2, '0')}</strong>
          <span className={styles.statDetail}>{detail}<ArrowUpRight size={13}/></span>
        </Link>)}
      </section>

      <div className={styles.mainGrid}>
        <section className={styles.panel} aria-label="Prochaines publications">
          <header className={styles.panelHeader}>
            <div><div className={styles.eyebrow}>PLANNING</div><h2>Prochaines campagnes</h2><p>Créneaux prévus dans votre espace.</p></div>
            <Link href="/campagnes" className={styles.textAction}>Calendrier <ArrowUpRight size={15}/></Link>
          </header>
          {campaigns.length > 0 ? <div className={styles.timeline}>
            {campaigns.slice(0, 4).map((campaign) => {
              const at = nextSlot(campaign)!;
              const announcement = data.announcements.find((a) => a.id === campaign.announcementId);
              return <div className={styles.timelineRow} key={campaign.id}>
                <span className={styles.timelineDot}/>
                <div className={styles.timelineContent}><strong>{campaign.name}</strong>
                  <span>{(campaign.announcementIds?.length ?? 1) > 1 ? `${campaign.announcementIds!.length} annonces` : announcement?.title ?? 'Annonce non trouvée'} · {campaign.destinationIds.length} destination(s)</span>
                </div>
                <time dateTime={at} className={styles.timelineDate}><CalendarClock size={14}/>{dateFR(at, { day: 'numeric', month: 'short' })}<small>{timeFR(at)}</small></time>
              </div>;
            })}
          </div> : <div className={styles.empty}><CalendarClock size={24}/><strong>Aucune campagne à venir</strong><p>Créez une campagne pour organiser vos prochaines publications.</p><Link href="/campagnes?nouveau=1" className={styles.secondaryButton}>Planifier une campagne <ArrowRight size={15}/></Link></div>}
          <p className={styles.footnote}>Les créneaux affichés ne garantissent pas à eux seuls l’exécution du moteur automatique.</p>
        </section>

        <section className={styles.panel} aria-label="Activité récente">
          <header className={styles.panelHeader}>
            <div><div className={styles.eyebrow}>ACTIVITÉ</div><h2>Les 7 derniers jours</h2><p>{activityTotal} action(s) enregistrée(s), dont {activityPublishes} publication(s).</p></div>
            <Link href="/historique" className={styles.textAction}>Historique <ArrowUpRight size={15}/></Link>
          </header>
          <div className={styles.chart} role="img" aria-label={`Activité des sept derniers jours : ${activity.map((d) => `${d.label} ${d.count} actions`).join(', ')}`}>
            {activity.map((day) => <div className={styles.chartColumn} key={day.key}>
              <div className={styles.chartBarTrack}><div className={styles.chartBar} style={{ height: day.count ? `${Math.max(7, (day.count / maxActivity) * 100)}%` : '3px' }} title={`${day.count} action(s)${day.publishes ? `, dont ${day.publishes} publication(s)` : ''}`}/></div>
              <span>{day.label.replace('.', '')}</span>
            </div>)}
          </div>
          <div className={styles.activityFooter}><div><Activity size={17}/><span>Actions consignées</span></div><strong>{activityTotal}</strong></div>
          <div className={styles.activityFooter}><div><Send size={17}/><span>Publications consignées</span></div><strong>{activityPublishes}</strong></div>
        </section>
      </div>

      <div className={styles.secondaryGrid}>
        <section className={styles.miniPanel} aria-label="Opérations demandant attention">
          <div className={styles.miniIcon}><ShieldCheck size={18}/></div>
          <div className={styles.miniCopy}>
            <strong>Opérations à surveiller</strong>
            {probe.kind === 'loading' ? <p>Vérification des opérations…</p> : probe.kind === 'error' ? <p>Supervision momentanément indisponible.</p> : <p>{alerts === 0 ? 'Aucune opération signalée parmi les tâches examinées.' : `${alerts} opération(s) nécessitent une vérification.`}{probe.value.partial ? ' Résultats partiels (500 tâches).' : ''}</p>}
          </div>
          {alerts !== null && alerts > 0 ? <AlertTriangle className={styles.attentionIcon} size={21}/> : <CheckCircle2 className={styles.readyIcon} size={21}/>}
          <Link href="/supervision" className={styles.miniLink} aria-label="Ouvrir la supervision"><ArrowUpRight size={18}/></Link>
        </section>
        {!allReady ? <section className={styles.miniPanel} aria-label="Bien démarrer">
          <div className={styles.miniIcon}><CheckCircle2 size={18}/></div>
          <div className={styles.miniCopy}><strong>Finir de préparer votre espace <span className={styles.stepProgress}>{readyCount}/3</span></strong>
            <div className={styles.stepList}>{readySteps.filter((step) => !step.isReady).map((step) => <Link key={step.name} href={step.href}>{step.name} <ArrowRight size={14}/></Link>)}</div>
          </div>
        </section> : <section className={styles.miniPanel} aria-label="Votre espace est prêt">
          <div className={styles.miniIcon}><CheckCircle2 size={18}/></div>
          <div className={styles.miniCopy}><strong>Votre espace est préparé</strong><p>Bibliothèque, destinations et planning renseignés.</p></div>
          <Link href="/campagnes" className={styles.miniLink} aria-label="Ouvrir les campagnes"><ArrowUpRight size={18}/></Link>
        </section>}
      </div>
    </div>
  </>;
}
