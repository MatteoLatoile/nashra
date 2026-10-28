'use client';

import { useState } from 'react';
import { Plus, Search, UsersRound, Trash2, ShieldCheck, ShieldAlert, Link2, Info, Pencil } from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useApp, type Destination } from '@/lib/store';
import { useLanguage } from '@/lib/i18n/provider';

export default function GroupsPage() {
  const { t } = useLanguage();
  const { data, addDestination, updateDestination, removeDestination, notify } = useApp();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false); const [editingId, setEditingId] = useState<string | null>(null); const [query, setQuery] = useState('');
  const [name, setName] = useState(''); const [handle, setHandle] = useState(''); const [category, setCategory] = useState('Général'); const [authorized, setAuthorized] = useState(false);
  const matches = data.destinations.filter(d => `${d.name} ${d.handle} ${d.category}`.toLowerCase().includes(query.toLowerCase()));
  function openCreate() { setEditingId(null); setName(''); setHandle(''); setCategory('Général'); setAuthorized(false); setOpen(true); }
  function openEdit(destination: Destination) {
    setEditingId(destination.id); setName(destination.name); setHandle(destination.handle);
    setCategory(destination.category); setAuthorized(destination.authorized); setOpen(true);
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = { name: name.trim(), handle: handle.trim(), category, authorized };
    if (!fields.name) return;
    if (editingId) updateDestination(editingId, fields); else addDestination(fields);
    setOpen(false); setEditingId(null);
  }
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
    <PageHeader eyebrow="VOS DESTINATIONS" title="Groupes & canaux" description="Organisez vos espaces de publication et leurs autorisations." actions={<button className="btn btn-primary" onClick={openCreate}><Plus size={17}/> Ajouter une destination</button>}/>
    <div className="notice-row"><ShieldCheck size={19}/><div><strong>Publier avec autorisation</strong><span>Une destination est éligible à la planification seulement si ses règles autorisent la publication. Connectez votre compte Telegram dans la rubrique Telegram pour importer vos groupes.</span></div></div>
    <div className="table-panel"><div className="table-top"><h2>Mes destinations <span>{data.destinations.length}</span></h2><div className="searchbox search-small"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Rechercher une destination" placeholder="Rechercher un groupe…"/></div></div>
      {matches.length ? <div className="table-scroller"><table className="data-table"><thead><tr><th>DESTINATION</th><th>CATÉGORIE</th><th>AUTORISATION</th><th>CONNEXION</th><th aria-label="Actions"/></tr></thead><tbody>{matches.map(d => <tr key={d.id}><td><div className="destination-name"><span className="group-avatar"><UsersRound size={20}/></span><span><strong>{d.name}</strong><small>{d.handle || 'Identifiant non renseigné'}</small></span></div></td><td><Badge>{t(d.category)}</Badge></td><td>{d.authorized ? <Badge tone="positive"><ShieldCheck size={13}/> Déclarée autorisée</Badge> : <Badge tone="warn"><ShieldAlert size={13}/> À vérifier</Badge>}</td><td><Badge tone={/^-?\d{3,30}$/.test(d.handle) ? 'positive' : 'neutral'}>{/^-?\d{3,30}$/.test(d.handle) ? 'ID Telegram' : 'Manuelle'}</Badge></td><td><div className="n20-group-actions"><button className="mini-action" aria-label={`Modifier ${d.name}`} title="Modifier" onClick={() => openEdit(d)}><Pencil size={16}/></button><button className="mini-action" aria-label={`Supprimer ${d.name}`} title="Supprimer" onClick={() => remove(d)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div> : <EmptyState icon={<UsersRound size={26}/>} title="Aucun groupe trouvé" description="Ajoutez votre première destination ou modifiez votre recherche."/>}
    </div>
    <div className="helper-line"><Info size={15}/> Les exemples ne correspondent pas à des groupes Telegram vérifiés.</div>
    {open && <Modal title={editingId ? 'Modifier une destination' : 'Ajouter une destination'} subtitle="Enregistrez un groupe ou un canal que vous avez le droit d’utiliser." onClose={() => setOpen(false)}><form className="form-stack" onSubmit={submit}><label className="field-label">Nom du groupe / canal <span>*</span><input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Commerce Médine" autoFocus/></label><label className="field-label">Identifiant Telegram numérique <small>(requis pour publier)</small><div className="input-icon"><Link2 size={17}/><input value={handle} onChange={e => setHandle(e.target.value)} placeholder="Ex. -1001234567890"/></div></label><label className="field-label">Catégorie<select value={category} onChange={e => setCategory(e.target.value)}><option value="Général">{t('Général')}</option><option value="Immobilier">{t('Immobilier')}</option><option value="Services">{t('Services')}</option><option value="Commerce">{t('Commerce')}</option><option value="Autre">{t('Autre')}</option></select></label><label className="check-field"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)}/><span><strong>Je confirme être autorisé à y publier.</strong><small>Je respecte les règles et limites fixées par les administrateurs du groupe.</small></span></label><div className="inline-help"><Info size={16}/> Pour publier, utilisez l’identifiant numérique d’un groupe présent dans vos conversations Telegram. Un @nom ou un lien t.me ne suffit pas. La déclaration ne change pas les permissions Telegram.</div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Annuler</button><button className="btn btn-primary" type="submit">{editingId ? 'Enregistrer les modifications' : 'Ajouter la destination'}</button></div></form></Modal>}
  </>;
}
