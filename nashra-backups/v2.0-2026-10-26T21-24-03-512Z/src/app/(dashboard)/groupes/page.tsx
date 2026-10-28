'use client';

import { useState } from 'react';
import { Plus, Search, UsersRound, Trash2, ShieldCheck, ShieldAlert, Link2, Info } from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useApp, type Destination } from '@/lib/store';

export default function GroupsPage() {
  const { data, addDestination, removeDestination, notify } = useApp();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const [name, setName] = useState(''); const [handle, setHandle] = useState(''); const [category, setCategory] = useState('Général'); const [authorized, setAuthorized] = useState(false);
  const matches = data.destinations.filter(d => `${d.name} ${d.handle} ${d.category}`.toLowerCase().includes(query.toLowerCase()));
  function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); addDestination({ name: name.trim(), handle: handle.trim(), category, authorized }); setName(''); setHandle(''); setAuthorized(false); setOpen(false); }
  async function remove(d: Destination) {
    const approved = await confirm({
      title: 'Retirer cette destination ?',
      description: 'Ce groupe sera retiré de Nashra. Les campagnes qui l’utilisent ne pourront plus le sélectionner.',
      item: d.name,
      itemLabel: 'DESTINATION CONCERNÉE',
      confirmText: 'Retirer le groupe',
      tone: 'danger',
    });
    if (approved) { removeDestination(d.id); notify('Destination retirée.'); }
  }
  return <>
    <PageHeader eyebrow="VOS DESTINATIONS" title="Groupes & canaux" description="Organisez vos espaces de publication et leurs autorisations." actions={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={17}/> Ajouter une destination</button>}/>
    <div className="notice-row"><ShieldCheck size={19}/><div><strong>Publier avec autorisation</strong><span>Une destination est éligible à la planification seulement si ses règles autorisent la publication. Connectez votre compte Telegram dans la rubrique Telegram pour importer vos groupes.</span></div></div>
    <div className="table-panel"><div className="table-top"><h2>Mes destinations <span>{data.destinations.length}</span></h2><div className="searchbox search-small"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Rechercher une destination" placeholder="Rechercher un groupe…"/></div></div>
      {matches.length ? <div className="table-scroller"><table className="data-table"><thead><tr><th>DESTINATION</th><th>CATÉGORIE</th><th>AUTORISATION</th><th>CONNEXION</th><th aria-label="Actions"/></tr></thead><tbody>{matches.map(d => <tr key={d.id}><td><div className="destination-name"><span className="group-avatar"><UsersRound size={20}/></span><span><strong>{d.name}</strong><small>{d.handle || 'Identifiant non renseigné'}</small></span></div></td><td><Badge>{d.category}</Badge></td><td>{d.authorized ? <Badge tone="positive"><ShieldCheck size={13}/> Déclarée autorisée</Badge> : <Badge tone="warn"><ShieldAlert size={13}/> À vérifier</Badge>}</td><td><Badge>Non connectée</Badge></td><td><button className="mini-action" aria-label={`Supprimer ${d.name}`} onClick={() => remove(d)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div> : <EmptyState icon={<UsersRound size={26}/>} title="Aucun groupe trouvé" description="Ajoutez votre première destination ou modifiez votre recherche."/>}
    </div>
    <div className="helper-line"><Info size={15}/> Les exemples ne correspondent pas à des groupes Telegram vérifiés.</div>
    {open && <Modal title="Ajouter une destination" subtitle="Enregistrez un groupe ou un canal que vous avez le droit d’utiliser." onClose={() => setOpen(false)}><form className="form-stack" onSubmit={submit}><label className="field-label">Nom du groupe / canal <span>*</span><input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Commerce Médine" autoFocus/></label><label className="field-label">Identifiant Telegram <small>(facultatif)</small><div className="input-icon"><Link2 size={17}/><input value={handle} onChange={e => setHandle(e.target.value)} placeholder="@nomdugroupe ou lien t.me"/></div></label><label className="field-label">Catégorie<select value={category} onChange={e => setCategory(e.target.value)}><option>Général</option><option>Immobilier</option><option>Services</option><option>Commerce</option><option>Autre</option></select></label><label className="check-field"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)}/><span><strong>Je confirme être autorisé à y publier.</strong><small>Je respecte les règles et limites fixées par les administrateurs du groupe.</small></span></label><div className="inline-help"><Info size={16}/> Cette déclaration confirme votre autorisation à publier. Elle ne modifie pas les permissions Telegram.</div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Annuler</button><button className="btn btn-primary" type="submit">Ajouter la destination</button></div></form></Modal>}
  </>;
}
