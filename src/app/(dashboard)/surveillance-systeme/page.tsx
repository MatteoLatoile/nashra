'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, CheckCircle2, CircleAlert, Clock3,
  Database, Gauge, RefreshCcw, Server, ShieldCheck, Timer, XCircle } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui';

type Status = 'ok' | 'warning' | 'error' | 'disabled';
type Check = { key:string; label:string; state:Status; detail:string };
type Run = {id:number;started_at:string;finished_at:string;duration_ms:number;outcome:string;stalled_flagged:number;expired_flagged:number};
type Report = {generatedAt:string;hours:number;checks:Check[];history:Run[];
  lastRunAt:string|null;partialHistory:boolean;publishingEnabled:boolean;
  summary:{attemptsRecorded:number;sent:number;incidents:number;averageDurationMs:number;
    outcomes:Record<string,number>;queue:Record<string,number>};disclaimer:string;readOnly:boolean};
const stateCopy:Record<Status,string> = {ok:'Opérationnel',warning:'À vérifier',error:'Erreur',disabled:'Désactivé'};
const outcomeCopy:Record<string,string> = {idle:'Aucune tâche',disabled:'Désactivé',sent:'Publication confirmée',
  blocked:'Bloqué',needs_review:'À examiner',error:'Erreur du worker'};
const formatDate = (value:string|null|undefined) => value ? new Date(value).toLocaleString('fr-FR',{
  dateStyle:'short',timeStyle:'short'}) : 'Aucune donnée';
const number = (value:number|undefined) => new Intl.NumberFormat('fr-FR').format(value ?? 0);
function StateIcon({state}:{state:Status}) {
  if (state==='ok') return <CheckCircle2 size={18}/>;
  if (state==='error') return <XCircle size={18}/>;
  return state==='warning' ? <CircleAlert size={18}/> : <Clock3 size={18}/>;
}
export default function SystemSurveillance() {
  const [hours,setHours] = useState(24);
  const [refresh,setRefresh] = useState(0);
  const [report,setReport] = useState<Report|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);setError('');setReport(null);
    fetch(`/api/admin/v35?hours=${hours}`,{cache:'no-store',signal:controller.signal})
      .then(async r => {const data = await r.json(); if (!r.ok) throw new Error(data.error||'Service indisponible.');return data as Report;})
      .then(data=>{if(!controller.signal.aborted)setReport(data);})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error ? e.message : 'Erreur de connexion.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return () => controller.abort();
  },[hours,refresh]);
  const counts = useMemo(() => ({
    ready:report?.checks.filter(c=>c.state==='ok').length || 0,
    warn:report?.checks.filter(c=>c.state==='warning').length || 0,
    errors:report?.checks.filter(c=>c.state==='error').length || 0,
  }),[report]);
  const maxBars = Math.max(1,...Object.values(report?.summary.outcomes||{}));
  return <div className="n35-root">
    <div className="n35-topnav"><Link href="/admin"><ArrowLeft size={15}/> Retour à l’administration</Link><span>OUTILS ADMINISTRATEUR / SUPERVISION</span></div>
    <PageHeader eyebrow="NASHRA / FIABILITÉ" title="Santé du système" description="État réel du worker, du schéma Supabase et des opérations de publication." actions={
      <button type="button" className="btn btn-secondary" disabled={loading} onClick={()=>setRefresh(x=>x+1)}>
        <RefreshCcw size={16} className={loading?'n35-spin':''}/> Actualiser</button>
    }/>
    <div className="n35-info"><ShieldCheck size={20}/><div><strong>Lecture seule · aucune action Telegram</strong>
      <p>Les diagnostics ne publient rien, ne modifient aucun abonnement et ne relancent jamais les envois incertains.</p></div></div>
    <div className="n35-toolbar"><div className="n35-switch" aria-label="Période des statistiques">
      {[6,24,72,168].map(h=><button type="button" key={h} className={hours===h?'active':''} onClick={()=>setHours(h)}>{h===168?'7 jours':`${h} h`}</button>)}</div>
      <a className="n35-export" href={`/api/admin/v35/export?hours=${hours}`}><ArrowDownToLine size={16}/> Exporter CSV</a></div>
    {loading && <div className="n35-placeholder" role="status"><Timer size={20} className="n35-spin"/> Chargement du diagnostic…</div>}
    {error && <div className="n35-failure" role="alert"><CircleAlert size={19}/><div><strong>Impossible de consulter la supervision.</strong><p>{error}</p>
      <small>Vérifiez l’accès administrateur, les migrations SQL 010 et 011 et le serveur.</small></div></div>}
    {report && <>
      <section className="n35-stats" aria-label="Chiffres de suivi">
        <article><div><Server size={18}/> Exécutions enregistrées</div><strong>{number(report.summary.attemptsRecorded)}</strong><small>Sur les {hours===168?'7 derniers jours':`${hours} dernières heures`}</small></article>
        <article><div><CheckCircle2 size={18}/> Publications confirmées</div><strong>{number(report.summary.sent)}</strong><small>Résultats renvoyés par le worker</small></article>
        <article><div><CircleAlert size={18}/> Incidents constatés</div><strong>{number(report.summary.incidents)}</strong><small>Bloquées, incertaines ou en erreur</small></article>
        <article><div><Gauge size={18}/> Durée moyenne</div><strong>{number(report.summary.averageDurationMs)} <em>ms</em></strong><small>Invocations présentes dans l’échantillon</small></article>
      </section>
      <div className="n35-grid">
        <section className="n35-panel"><header><div><h2>État des composants</h2><p>{counts.ready} opérationnels · {counts.warn} à vérifier · {counts.errors} en erreur</p></div><Database size={18}/></header>
          <div className="n35-checks">{report.checks.map(c=><div className="n35-check" key={c.key}><div className={`n35-check-icon n35-${c.state}`}><StateIcon state={c.state}/></div>
            <div><strong>{c.label}</strong><p>{c.detail}</p></div><span className={`n35-status n35-${c.state}`}>{stateCopy[c.state]}</span></div>)}</div>
        </section>
        <div className="n35-side">
          <section className="n35-panel"><header><div><h2>Dernier passage Cron</h2><p>Dernière invocation enregistrée</p></div><Clock3 size={18}/></header>
            <div className="n35-last"><strong>{formatDate(report.lastRunAt)}</strong><p>{report.publishingEnabled
              ? 'Lorsque les publications sont activées, prévoyez un appel externe régulier du Cron.'
              : 'Les publications sont actuellement désactivées côté serveur.'}</p></div>
          </section>
          <section className="n35-panel"><header><div><h2>Résultats du worker</h2><p>Distribution des invocations</p></div><Activity size={18}/></header>
            <div className="n35-bars">{Object.entries(report.summary.outcomes).map(([key,value])=><div key={key} className="n35-bar-row"><span>{outcomeCopy[key]||key}</span>
              <div><i style={{width:`${value?Math.max(4,(value/maxBars)*100):0}%`}}/></div><b>{value}</b></div>)}</div>
          </section>
          <section className="n35-panel"><header><div><h2>File d’attente</h2><p>Nombre d’opérations par statut</p></div><Server size={18}/></header>
            <div className="n35-queue">{Object.entries(report.summary.queue).map(([key,value])=><div key={key}><span>{outcomeCopy[key]||key.replaceAll('_',' ')}</span><strong>{number(value)}</strong></div>)}</div>
          </section>
        </div>
      </div>
      <section className="n35-panel n35-timeline"><header><div><h2>Historique des exécutions</h2><p>Invocations du worker enregistrées dans Supabase</p></div><Server size={18}/></header>
        <div className="n35-table-wrap"><table><thead><tr><th>Début</th><th>Résultat</th><th>Durée</th><th>À examiner</th><th>Expirées</th></tr></thead>
        <tbody>{report.history.map(run=><tr key={run.id}><td>{formatDate(run.started_at)}</td><td><span className={`n35-tag ${['error','needs_review','blocked'].includes(run.outcome)?'n35-risk':''}`}>{outcomeCopy[run.outcome]||run.outcome}</span></td>
          <td>{number(run.duration_ms)} ms</td><td>{number(run.stalled_flagged)}</td><td>{number(run.expired_flagged)}</td></tr>)}</tbody></table>
        {!report.history.length && <div className="n35-empty">Aucune exécution enregistrée pour cette période. Vérifiez le Cron, la migration SQL 011 et l’activation du moteur.</div>}</div>
        {report.partialHistory && <p className="n35-notice">Affichage limité aux 200 dernières invocations de la période. L’export CSV est limité à 500.</p>}
      </section>
      <footer className="n35-footer"><span>Vérification du {formatDate(report.generatedAt)}.</span>
        <span>Ces mesures ne prouvent pas à elles seules la réception d’un message Telegram.</span></footer>
    </>}
  </div>;
}
