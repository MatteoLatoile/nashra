'use client';

/* NASHRA_ADMIN_V34 — protected data sourced exclusively from /api/admin/v34 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight,
  CircleAlert, Clock3, CreditCard, FileClock, Gauge, LockKeyhole, RefreshCw, Search,
  ShieldCheck, UsersRound, Wifi, X } from 'lucide-react';
import { PageHeader } from '@/components/ui';

type Section = 'overview'|'users'|'billing'|'incidents'|'audit';
type QueueStats = Record<string,number>;
type Overview = { tab:'overview';totalUsers:number;telegramAccounts:number;activeSubscriptions:number;
  tiers:Record<string,number>;queue:QueueStats;trend:{date:string;total:number}[];
  publishingEnabled:boolean;billingTestEnabled:boolean;generatedAt:string };
type UserRow = { id:string;email:string|null;createdAt:string;lastSignIn:string|null;confirmed:boolean;
  tier:string;subscription:string;periodEnd:string|null;pending:number };
type Subscription = { user_id:string;status:string;price_id:string|null;current_period_end:string|null;
  cancel_at_period_end:boolean;updated_at:string };
type Incident = {id:string;user_id:string;status:string;scheduled_at:string;attempted_at:string|null;
  finished_at:string|null;last_error:string|null;created_at:string};
type Case = {id:string;queue_id:string;status:'open'|'investigating'|'resolved';note:string;updated_at:string};
type Audit = {id:number;actor_id:string|null;action:string;target_id:string|null;details:Record<string,unknown>;created_at:string};
type AdminData = Partial<Overview> & { tab:Section;page?:number;total?:number;
  users?:UserRow[];subscriptions?:Subscription[];incidents?:Incident[];cases?:Case[];entries?:Audit[] };

const sections: {id:Section;label:string;icon:typeof Activity}[] = [
  {id:'overview',label:'Vue générale',icon:Gauge},
  {id:'users',label:'Utilisateurs',icon:UsersRound},
  {id:'billing',label:'Abonnements',icon:CreditCard},
  {id:'incidents',label:'Incidents',icon:CircleAlert},
  {id:'audit',label:'Journal d’audit',icon:FileClock},
];
const queueLabels:Record<string,string> = {held:'En attente',approved:'Approuvées',processing:'Traitement',
  sent:'Confirmées',needs_review:'À examiner',blocked:'Bloquées',cancelled:'Annulées'};
const n = (value:number|undefined) => new Intl.NumberFormat('fr-FR').format(value ?? 0);
const date = (text:string|null|undefined) => text ? new Date(text).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}) : '—';
const short = (value:string|null|undefined) => value ? `${value.slice(0,8)}…` : '—';
function Badge({value}: {value:string}) {
  const good = ['active','trialing','sent','resolved','business','pro'].includes(value);
  const warn = ['needs_review','blocked','past_due','processing','investigating'].includes(value);
  return <span className={`n34-badge ${good?'n34-good':warn?'n34-warning':''}`}>{value.replaceAll('_',' ')}</span>;
}

export default function AdminPage() {
  const [tab,setTab] = useState<Section>('overview');
  const [page,setPage] = useState(1);
  const [data,setData] = useState<AdminData|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState<Incident|null>(null);
  const [caseStatus,setCaseStatus] = useState<Case['status']>('investigating');
  const [caseNote,setCaseNote] = useState('');
  const [saving,setSaving] = useState(false);
  const [caseError,setCaseError] = useState('');
  const [refreshKey,setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k+1),[]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    fetch(`/api/admin/v34?tab=${tab}&page=${page}`,{cache:'no-store',signal:controller.signal})
      .then(async response => {
        const result:AdminData & {error?:string} = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erreur serveur.');
        return result;
      })
      .then(setData)
      .catch(e => {if (!controller.signal.aborted) setError(e instanceof Error?e.message:'Erreur de chargement.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[tab,page,refreshKey]);
  const visibleUsers = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return (data?.users || []).filter(user => !q || `${user.id} ${user.email || ''}`.toLocaleLowerCase().includes(q));
  },[data?.users,search]);
  const caseMap = useMemo(() => new Map((data?.cases || []).map(c => [c.queue_id,c])),[data?.cases]);
  function changeTab(next:Section) { setTab(next);setPage(1);setSearch('');setError(''); }
  function editIncident(row:Incident) {
    const existing = caseMap.get(row.id);
    setSelected(row);setCaseStatus(existing?.status || 'investigating');setCaseNote(existing?.note || '');setCaseError('');
  }
  async function saveCase(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || saving) return;
    setCaseError('');setSaving(true);
    try {
      const res = await fetch('/api/admin/v34/cases', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({queueId:selected.id,status:caseStatus,note:caseNote})});
      const json = await res.json() as {error?:string};
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible.');
      setSelected(null);refresh();
    } catch(e) {setCaseError(e instanceof Error?e.message:'Erreur.');}
    finally {setSaving(false);}
  }
  return <div className="n34-root">
    <div className="n35-adminlink"><a href="/surveillance-systeme">Santé du système ↗</a><span>Suivi du Cron, migrations et incidents — lecture seule</span></div>
    <PageHeader eyebrow="NASHRA · CENTRE DE CONTRÔLE" title="Administration"
      description="Pilotage du service, abonnements de test, suivi des incidents et audit des interventions."
      actions={<button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
        <RefreshCw size={16} className={loading?'n34-spin':''}/> Actualiser</button>}/>

    <div className="n34-alert"><ShieldCheck size={19}/><div><strong>Zone réservée aux administrateurs</strong>
      <span>Les accès sont vérifiés côté serveur. Aucun mot de passe, jeton Telegram ou secret Stripe n’est affiché.</span></div></div>
    <nav className="n34-tabs" aria-label="Sections d’administration">
      {sections.map(s => <button type="button" key={s.id} onClick={() => changeTab(s.id)}
        className={tab===s.id?'n34-tab selected':'n34-tab'} aria-current={tab===s.id?'page':undefined}>
        <s.icon size={16}/><span>{s.label}</span></button>)}
    </nav>
    {error && <div role="alert" className="n34-error"><CircleAlert size={18}/><div><strong>Chargement impossible</strong>
      <p>{error}</p><button className="n34-text-action" type="button" onClick={refresh}>Réessayer</button></div></div>}
    {loading && <div className="n34-loading"><RefreshCw size={19} className="n34-spin"/>Synchronisation des données…</div>}
    {!loading && !error && data && <>
      {tab==='overview' && <>
        <div className="n34-stats">
          <div className="n34-stat"><div><UsersRound size={17}/> Comptes inscrits</div><strong>{n(data.totalUsers)}</strong><small>Utilisateurs enregistrés dans Supabase Auth</small></div>
          <div className="n34-stat"><div><Wifi size={17}/> Connexions Telegram</div><strong>{n(data.telegramAccounts)}</strong><small>Comptes Telegram enregistrés</small></div>
          <div className="n34-stat"><div><CreditCard size={17}/> Abonnements actifs</div><strong>{n(data.activeSubscriptions)}</strong><small>Actifs ou en essai · Stripe test</small></div>
          <div className="n34-stat"><div><CircleAlert size={17}/> À surveiller</div><strong>{n((data.queue?.needs_review||0)+(data.queue?.blocked||0))}</strong><small>Opérations bloquées ou à vérifier</small></div>
        </div>
        <div className="n34-columns">
          <section className="n34-panel"><div className="n34-panel-head"><div><h2>Activité des 7 derniers jours</h2><p>Nouvelles tâches créées (jours UTC)</p></div><Activity size={19}/></div>
            <div className="n34-chart">{(data.trend||[]).map(point => {
              const max = Math.max(1,...(data.trend||[]).map(x=>x.total));
              return <div className="n34-bar-group" key={point.date} title={`${point.date} : ${point.total}`}>
                <span>{n(point.total)}</span><div className="n34-bar-rail"><div style={{height:`${Math.max(point.total?6:2,point.total/max*100)}%`}}/></div>
                <small>{new Date(`${point.date}T12:00:00Z`).toLocaleDateString('fr-FR',{weekday:'short'})}</small></div>;
            })}</div></section>
          <section className="n34-panel"><div className="n34-panel-head"><div><h2>État des services</h2><p>Configuration détectée côté serveur</p></div><LockKeyhole size={19}/></div>
            <div className="n34-service"><span>Moteur automatique</span><Badge value={data.publishingEnabled?'configured':'disabled'}/></div>
            <div className="n34-service"><span>Facturation Stripe</span><Badge value={data.billingTestEnabled?'test':'disabled'}/></div>
            <div className="n34-service"><span>Forfaits attribués</span><strong>{n((data.tiers?.pro||0)+(data.tiers?.business||0))}</strong></div>
            <p className="n34-hint">Une configuration détectée ne garantit pas qu’un Cron externe exécute le worker.</p></section>
        </div>
        <section className="n34-panel"><div className="n34-panel-head"><div><h2>File d’attente — tous les comptes</h2><p>Statuts réels conservés dans Supabase</p></div><button className="n34-link" onClick={() => changeTab('incidents')} type="button">Voir les incidents <ArrowRight size={14}/></button></div>
          <div className="n34-queue-grid">{Object.entries(queueLabels).map(([key,label]) =>
            <div key={key}><small>{label}</small><strong>{n(data.queue?.[key])}</strong></div>)}</div></section>
        <p className="n34-foot">Actualisé le {date(data.generatedAt)}. Ces données sont agrégées et peuvent varier entre deux actualisations.</p>
      </>}
      {tab==='users' && <section className="n34-panel"><div className="n34-panel-head"><div><h2>Comptes utilisateurs</h2><p>{n(data.total)} inscrits · 25 résultats par page</p></div><Export resource="users"/></div>
        <div className="n34-search"><Search size={17}/><input aria-label="Rechercher un compte sur cette page" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un e-mail ou un identifiant sur cette page…"/></div>
        <div className="n34-scroll"><table className="n34-table"><thead><tr><th>Compte</th><th>Forfait</th><th>Abonnement</th><th>Tâches actives</th><th>Dernière connexion</th></tr></thead>
          <tbody>{visibleUsers.map(row => <tr key={row.id}><td><strong>{row.email||'Aucun e-mail'}</strong><small title={row.id}>{short(row.id)} · inscrit le {date(row.createdAt)}</small></td>
            <td><Badge value={row.tier}/></td><td><Badge value={row.subscription}/></td><td>{row.pending}</td><td>{date(row.lastSignIn)}</td></tr>)}</tbody></table>
          {!visibleUsers.length && <div className="n34-empty">Aucun compte sur cette page ne correspond à ta recherche.</div>}</div>
        <p className="n34-hint">Les recherches sont limitées à la page affichée. L’export couvre les 200 premiers comptes.</p><Pager page={page} total={data.total||0} size={25} onChange={setPage}/></section>}
      {tab==='billing' && <section className="n34-panel"><div className="n34-panel-head"><div><h2>Abonnements</h2><p>{n(data.total)} lignes · synchronisation Stripe en mode test</p></div><Export resource="billing"/></div>
        <div className="n34-scroll"><table className="n34-table"><thead><tr><th>Utilisateur</th><th>Statut</th><th>Prix Stripe</th><th>Fin de période</th><th>Annulation</th></tr></thead>
          <tbody>{(data.subscriptions||[]).map(s => <tr key={s.user_id}><td title={s.user_id}>{short(s.user_id)}</td><td><Badge value={s.status}/></td>
            <td>{s.price_id||'—'}</td><td>{date(s.current_period_end)}</td><td>{s.cancel_at_period_end?'Programmée':'—'}</td></tr>)}</tbody></table>
          {!data.subscriptions?.length && <div className="n34-empty">Aucun abonnement à afficher.</div>}</div>
        <p className="n34-hint">Les forfaits sont calculés par les événements Stripe signés. Modifier un statut ici sans vérification Stripe n’est pas autorisé.</p><Pager page={page} total={data.total||0} size={30} onChange={setPage}/></section>}
      {tab==='incidents' && <section className="n34-panel"><div className="n34-panel-head"><div><h2>Incidents et interventions</h2><p>{n(data.total)} opérations à examiner, bloquées ou en cours</p></div><Export resource="incidents"/></div>
        <p className="n34-hint">Classer un dossier ne relance jamais un envoi Telegram. Vérifie manuellement Telegram avant de conclure qu’un message n’a pas été envoyé.</p>
        <div className="n34-incidents">{(data.incidents||[]).map(row => {
          const related = caseMap.get(row.id);
          return <article key={row.id} className="n34-incident"><div className="n34-incident-main"><span><Badge value={row.status}/>{related&&<Badge value={related.status}/>}</span>
            <strong title={row.id}>Opération {short(row.id)}</strong><small>Utilisateur {short(row.user_id)} · Planifiée {date(row.scheduled_at)} · Tentative {date(row.attempted_at)}</small>
            <p>{row.last_error||'Aucun détail d’erreur enregistré.'}</p></div><button type="button" className="btn btn-secondary" onClick={() => editIncident(row)}>Examiner <ArrowRight size={15}/></button></article>;
        })}{!data.incidents?.length&&<div className="n34-empty"><CheckCircle2 size={23}/> Aucun incident signalé.</div>}</div>
        <Pager page={page} total={data.total||0} size={30} onChange={setPage}/></section>}
      {tab==='audit' && <section className="n34-panel"><div className="n34-panel-head"><div><h2>Journal des actions administratives</h2><p>{n(data.total)} modifications enregistrées</p></div><FileClock size={18}/></div>
        <div className="n34-scroll"><table className="n34-table"><thead><tr><th>Date</th><th>Action</th><th>Administrateur</th><th>Opération</th></tr></thead>
          <tbody>{(data.entries||[]).map(entry => <tr key={entry.id}><td>{date(entry.created_at)}</td><td><Badge value={entry.action}/></td>
            <td title={entry.actor_id||''}>{short(entry.actor_id)}</td><td title={entry.target_id||''}>{short(entry.target_id)}</td></tr>)}</tbody></table>
          {!data.entries?.length&&<div className="n34-empty">Aucune intervention enregistrée.</div>}</div><Pager page={page} total={data.total||0} size={30} onChange={setPage}/></section>}
    </>}
    {selected && <div className="n34-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null);}}>
      <section className="n34-dialog" role="dialog" aria-modal="true" aria-labelledby="n34-case-title">
        <div className="n34-dialog-head"><div><p>SUPERVISION / DOSSIER</p><h2 id="n34-case-title">Examiner une opération</h2></div>
          <button aria-label="Fermer" type="button" onClick={() => setSelected(null)} disabled={saving}><X size={19}/></button></div>
        <form className="n34-form" onSubmit={e=>void saveCase(e)}><div className="n34-dialog-meta"><span>Opération</span><code>{short(selected.id)}</code>
          <span>Statut d’envoi</span><Badge value={selected.status}/></div>
          <label>État du dossier<select value={caseStatus} onChange={e=>setCaseStatus(e.target.value as Case['status'])}>
            <option value="open">Ouvert</option><option value="investigating">En cours d’examen</option><option value="resolved">Classé après vérification</option></select></label>
          <label>Note interne (obligatoire)<textarea required minLength={8} maxLength={600} rows={5} value={caseNote} onChange={e=>setCaseNote(e.target.value)} placeholder="Résultat de la vérification, décision et éléments utiles…"/></label>
          <div className="n34-dialog-warning"><Clock3 size={17}/> La note est réservée aux administrateurs. Aucune nouvelle publication n’est déclenchée.</div>
          {caseError&&<p className="n34-error" role="alert">{caseError}</p>}
          <div className="n34-dialog-actions"><button type="button" className="btn btn-secondary" onClick={() => setSelected(null)} disabled={saving}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving||caseNote.trim().length<8}>{saving?'Enregistrement…':'Enregistrer le dossier'}</button></div>
        </form></section></div>}
  </div>;
}
function Export({resource}:{resource:'users'|'billing'|'incidents'}) {
  return <a className="n34-export" href={`/api/admin/v34/export?resource=${resource}`}><ArrowDownToLine size={16}/> Export CSV</a>;
}
function Pager({page,total,size,onChange}:{page:number;total:number;size:number;onChange:(page:number)=>void}) {
  const max = Math.max(1,Math.ceil(total/size));
  if (max <= 1) return null;
  return <div className="n34-pager"><span>Page {page} / {max}</span><div>
    <button type="button" aria-label="Page précédente" disabled={page===1} onClick={()=>onChange(page-1)}><ChevronLeft size={17}/></button>
    <button type="button" aria-label="Page suivante" disabled={page>=max} onClick={()=>onChange(page+1)}><ChevronRight size={17}/></button>
  </div></div>;
}
