'use client';
import { History, Clock3, CircleDot, ShieldAlert } from 'lucide-react';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { dateFR, timeFR, useApp } from '@/lib/store';
export default function HistoryPage() {
  const { data, cloudMode } = useApp();
  return <><PageHeader eyebrow="JOURNAL D’ACTIVITÉ" title="Historique" description="Retrouvez vos actions enregistrées dans votre espace Nashra."/>
    <div className="notice-row"><ShieldAlert size={20}/><div><strong>Historique des actions Nashra</strong><span>Les envois manuels depuis votre compte personnel sont journalisés dans cet espace ; les campagnes programmées ne sont pas encore exécutées automatiquement.</span></div></div>
    {data.activity.length ? <div className="history-panel"><div className="table-top"><h2>Activité récente <span>{data.activity.length}</span></h2><Badge>{cloudMode ? "Cloud" : "Local"}</Badge></div>{data.activity.map(a => <div className="history-row" key={a.id}><span className="history-icon"><CircleDot size={17}/></span><div className="history-content"><strong>{a.title}</strong><p>{a.detail}</p></div><span className="history-date"><Clock3 size={14}/>{dateFR(a.createdAt)} · {timeFR(a.createdAt)}</span></div>)}</div> : <EmptyState icon={<History size={26}/>} title="Aucune activité" description="Vos prochaines actions apparaîtront ici."/>}
  </>;
}
