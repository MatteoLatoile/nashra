'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnnouncementImageUpload } from '@/components/announcement-image-upload';
import {
  Plus, Search, FileText, Trash2, Eye, ArrowUpRight, Copy, MessageSquareText,
  Images, Pencil, Layers3, SlidersHorizontal, CalendarDays, Link2, Check,
  ExternalLink, ChevronLeft, ChevronRight, Send, X,
} from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { dateFR, useApp, type Announcement } from '@/lib/store';

const mainCategories = ['Immobilier', 'Services', 'Commerce', 'Événement', 'Autre'];
const maxImages = 10;

type Editor = {
  id?: string;
  title: string;
  category: string;
  body: string;
  sourceUrl: string;
  pictures: string;
  tags: string;
};
const emptyEditor = (): Editor => ({ title: '', category: 'Immobilier', body: '', sourceUrl: '', pictures: '', tags: '' });

function imageUrls(a: Announcement) { return Array.isArray(a.imageUrls) ? a.imageUrls : []; }
function isHttpsImageUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname; }
  catch { return false; }
}
function linksFromEditor(value: string) { return [...new Set(value.split(/\r?\n/g).map(x => x.trim()).filter(Boolean))]; }

export default function AnnouncementsPage() {
  const { data, addAnnouncement, updateAnnouncement, removeAnnouncement, notify } = useApp();
  const confirm = useConfirm();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [editorError, setEditorError] = useState('');
  const [filter, setFilter] = useState('Toutes');
  const [origin, setOrigin] = useState('Toutes');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const categories = useMemo(() => ['Toutes', ...new Set([...mainCategories, ...data.announcements.map(a => a.category)].filter(Boolean))], [data.announcements]);
  const filtered = useMemo(() => data.announcements.filter(a => {
    if (filter !== 'Toutes' && a.category !== filter) return false;
    if (origin === 'Telegram' && !a.sourceMessageId) return false;
    if (origin === 'Manuelles' && a.sourceMessageId) return false;
    const haystack = `${a.title} ${a.body} ${a.category} ${(a.tags || []).join(' ')}`.toLocaleLowerCase();
    return haystack.includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title) : sort === 'oldest'
    ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)), [data.announcements, filter, origin, query, sort]);
  const preview = data.announcements.find(a => a.id === previewId) || null;
  const images = preview ? imageUrls(preview) : [];
  const sourceCount = data.announcements.filter(a => a.sourceMessageId).length;
  const imagesCount = data.announcements.filter(a => imageUrls(a).length).length;

  function startCreate() { setEditor(emptyEditor()); setEditorError(''); }
  function startEdit(a: Announcement) {
    setEditor({ id: a.id, title: a.title, category: a.category, body: a.body, sourceUrl: a.sourceUrl,
      pictures: imageUrls(a).join('\n'), tags: (a.tags || []).join(', ') });
    setEditorError('');
  }
  function startPreview(id: string) { setPreviewId(id); setImageIndex(0); }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const title = editor.title.trim();
    const body = editor.body.trim();
    if (!title || !body) { setEditorError('Le titre et le contenu sont obligatoires.'); return; }
    const urls = linksFromEditor(editor.pictures);
    if (urls.length > maxImages) { setEditorError(`Ajoutez au maximum ${maxImages} images par annonce.`); return; }
    if (urls.some(x => !isHttpsImageUrl(x))) { setEditorError('Les liens des images doivent commencer par https:// et être valides.'); return; }
    if (editor.sourceUrl.trim() && !/^https:\/\//i.test(editor.sourceUrl.trim())) {
      setEditorError('Le lien source doit commencer par https://.'); return;
    }
    const fields = { title, body, category: editor.category.trim() || 'Autre', sourceUrl: editor.sourceUrl.trim(),
      imageUrls: urls, tags: [...new Set(editor.tags.split(',').map(x => x.trim()).filter(Boolean))].slice(0, 12) };
    if (editor.id) updateAnnouncement(editor.id, fields);
    else addAnnouncement(fields);
    setEditor(null);
  }
  async function remove(a: Announcement) {
    const approved = await confirm({ title: 'Supprimer cette annonce ?',
      description: 'Elle sera retirée de la bibliothèque et des campagnes auxquelles elle est associée. Cette action est irréversible.',
      item: a.title, itemLabel: 'ANNONCE À SUPPRIMER', confirmText: 'Supprimer l’annonce', tone: 'danger' });
    if (approved) { removeAnnouncement(a.id); if (previewId === a.id) setPreviewId(null); }
  }
  async function duplicate(a: Announcement) {
    addAnnouncement({ title: `${a.title} — copie`, category: a.category, body: a.body,
      sourceUrl: a.sourceUrl, imageUrls: imageUrls(a), tags: a.tags || [] });
    notify('Copie créée. Le message Telegram original n’a pas été dupliqué.');
  }
  async function copy(a: Announcement) {
    try { await navigator.clipboard.writeText(a.body); notify('Texte copié.'); }
    catch { notify('Le presse-papiers est indisponible.'); }
  }

  return <div className="n12-library">
    <PageHeader eyebrow="BIBLIOTHÈQUE" title="Mes annonces" description="Importez, organisez et préparez vos publications au même endroit."
      actions={<div className="n12-header-actions"><Link href="/telegram" className="btn btn-secondary"><Send size={16}/> Importer de Telegram</Link><button className="btn btn-primary" onClick={startCreate}><Plus size={17}/> Nouvelle annonce</button></div>}/>

    <div className="n12-summary" aria-label="Résumé de la bibliothèque">
      <div><span><Layers3 size={16}/> Toutes les annonces</span><strong>{data.announcements.length.toString().padStart(2, '0')}</strong></div>
      <div><span><Send size={16}/> Importées de Telegram</span><strong>{sourceCount.toString().padStart(2, '0')}</strong></div>
      <div><span><Images size={16}/> Avec images</span><strong>{imagesCount.toString().padStart(2, '0')}</strong></div>
    </div>

    <div className="n12-controls">
      <label className="n12-search"><Search size={17}/><input aria-label="Rechercher dans la bibliothèque" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un titre, un mot, un tag…"/></label>
      <label className="n12-select"><SlidersHorizontal size={15}/><span>Source</span><select aria-label="Filtrer par source" value={origin} onChange={event => setOrigin(event.target.value)}><option>Toutes</option><option>Telegram</option><option>Manuelles</option></select></label>
      <label className="n12-select"><span>Tri</span><select aria-label="Trier les annonces" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="newest">Récentes</option><option value="oldest">Anciennes</option><option value="az">A → Z</option></select></label>
      <div className="n12-view" role="group" aria-label="Mode d’affichage"><button onClick={() => setView('grid')} aria-pressed={view === 'grid'} title="Vue cartes"><Images size={17}/></button><button onClick={() => setView('list')} aria-pressed={view === 'list'} title="Vue liste"><FileText size={17}/></button></div>
    </div>
    <div className="n12-filter-row" aria-label="Catégories">{categories.map(c => <button key={c} className={filter === c ? 'n12-pill active' : 'n12-pill'} onClick={() => setFilter(c)}>{c}</button>)}</div>
    <div className="n12-results"><span><strong>{filtered.length}</strong> résultat{filtered.length !== 1 ? 's' : ''}</span><span>Les annonces ne sont jamais envoyées depuis cette page.</span></div>

    {filtered.length ? <div className={view === 'grid' ? 'n12-grid' : 'n12-grid n12-list'}>
      {filtered.map(a => <article className="n12-card" key={a.id}>
        <button type="button" className="n12-cover" onClick={() => startPreview(a.id)} aria-label={`Prévisualiser ${a.title}`}>
          {imageUrls(a).length ? <><img src={imageUrls(a)[0]} alt="" loading="lazy"/><span className="n12-photo-count"><Images size={13}/>{imageUrls(a).length}</span></> : <div className="n12-placeholder"><FileText size={31} strokeWidth={1.2}/><span>ANNONCE</span></div>}
        </button>
        <div className="n12-card-body"><div className="n12-card-top"><Badge>{a.category}</Badge><span className="n12-source-chip">{a.sourceMessageId ? 'Telegram' : 'Manuelle'}</span></div>
          <h3>{a.title}</h3><p>{a.body}</p>
          {(a.tags || []).length > 0 && <div className="n12-tags">{(a.tags || []).slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</div>}
          <div className="n12-card-bottom"><span><CalendarDays size={13}/>{dateFR(a.createdAt)}</span><div className="n12-card-actions">
            <button onClick={() => void copy(a)} aria-label={`Copier ${a.title}`} title="Copier"><Copy size={16}/></button>
            <button onClick={() => void duplicate(a)} aria-label={`Dupliquer ${a.title}`} title="Dupliquer"><Layers3 size={16}/></button>
            <button onClick={() => startEdit(a)} aria-label={`Modifier ${a.title}`} title="Modifier"><Pencil size={16}/></button>
            <button onClick={() => startPreview(a.id)} aria-label={`Aperçu de ${a.title}`} title="Aperçu"><Eye size={17}/></button>
          </div></div>
        </div>
      </article>)}
    </div> : <EmptyState icon={<FileText size={27}/>} title="Aucune annonce à afficher" description={data.announcements.length ? 'Modifiez vos filtres pour retrouver vos publications.' : 'Commencez par créer une annonce ou importer un message depuis Telegram.'}
      action={<div className="n12-empty-actions"><button className="btn btn-primary" onClick={startCreate}><Plus size={16}/> Créer une annonce</button><Link className="btn btn-secondary" href="/telegram">Importer de Telegram</Link></div>}/>}

    {editor && <Modal title={editor.id ? 'Modifier une annonce' : 'Nouvelle annonce'} subtitle="Préparez votre contenu, sans publication automatique." onClose={() => setEditor(null)}>
      <form onSubmit={save} className="form-stack n12-editor">
        <div className="n12-editor-row"><label className="field-label">Titre <span>*</span><input value={editor.title} onChange={e => setEditor({...editor, title:e.target.value})} maxLength={90} required autoFocus placeholder="Ex. Appartement meublé à Quba"/></label>
          <label className="field-label">Catégorie<select value={editor.category} onChange={e => setEditor({...editor, category:e.target.value})}>{[...new Set([...mainCategories, editor.category])].map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>
        <label className="field-label">Contenu de la publication <span>*</span><textarea value={editor.body} onChange={e => setEditor({...editor, body:e.target.value})} rows={6} maxLength={5000} required placeholder="Rédigez votre texte…"/></label>
        <label className="field-label">Images de l’album <small>(maximum {maxImages} liens HTTPS, un par ligne)</small><textarea value={editor.pictures} onChange={e => setEditor({...editor, pictures:e.target.value})} rows={3} placeholder={'https://exemple.com/photo1.jpg\nhttps://exemple.com/photo2.jpg'}/></label>
        <AnnouncementImageUpload
          currentCount={linksFromEditor(editor.pictures).length}
          maxCount={maxImages}
          onUploaded={urls => setEditor(previous => previous ? {
            ...previous,
            pictures: [...new Set([...linksFromEditor(previous.pictures), ...urls])].join('\n')
          } : previous)}
        />
        <div className="n12-image-thumbs">{linksFromEditor(editor.pictures).filter(isHttpsImageUrl).slice(0, maxImages).map(url =>
          <span className="n13-thumb" key={url}>
            <img src={url} alt="Prévisualisation du média" loading="lazy" />
            <button type="button" aria-label="Retirer cette photo de l’annonce" title="Retirer du brouillon"
              onClick={() => setEditor(previous => previous ? { ...previous,
                pictures: linksFromEditor(previous.pictures).filter(item => item !== url).join('\n')
              } : previous)}><X size={12}/></button>
          </span>
        )}</div>
        <label className="field-label">Tags <small>(séparés par une virgule)</small><input value={editor.tags} onChange={e => setEditor({...editor, tags:e.target.value})} placeholder="Médine, appartement, meublé"/></label>
        <label className="field-label">Lien Telegram original <small>(facultatif)</small><div className="input-icon"><Link2 size={16}/><input type="url" value={editor.sourceUrl} onChange={e => setEditor({...editor, sourceUrl:e.target.value})} placeholder="https://t.me/canal/123"/></div></label>
        <div className="inline-help"><MessageSquareText size={16}/> Les images ajoutées depuis votre ordinateur sont hébergées dans un bucket public Supabase Storage. Leur URL est accessible à toute personne qui la possède. Les transferts Telegram nécessitent toujours les autorisations du groupe.</div>
        {editorError && <p className="n12-error" role="alert">{editorError}</p>}
        <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditor(null)}>Annuler</button><button type="submit" className="btn btn-primary"><Check size={16}/> {editor.id ? 'Enregistrer les changements' : 'Créer l’annonce'}</button></div>
      </form>
    </Modal>}

    {preview && <Modal title="Prévisualisation" subtitle={preview.title} onClose={() => setPreviewId(null)}>
      <div className="n12-preview">
        {images.length > 0 && <div className="n12-gallery"><img src={images[Math.min(imageIndex, images.length-1)]} alt={`Image ${imageIndex+1} de ${images.length}`} />
          {images.length > 1 && <><button type="button" aria-label="Image précédente" className="n12-prev" onClick={() => setImageIndex(i => (i-1+images.length)%images.length)}><ChevronLeft size={21}/></button><button type="button" className="n12-next" aria-label="Image suivante" onClick={() => setImageIndex(i => (i+1)%images.length)}><ChevronRight size={21}/></button><span className="n12-count">{imageIndex+1} / {images.length}</span></>}
        </div>}
        <div className="n12-preview-top"><Badge>{preview.category}</Badge><span>{preview.sourceMessageId ? 'Importée de Telegram' : 'Création manuelle'}</span></div>
        <div className="n12-tg-bubble"><div className="n12-bubble-head"><span><MessageSquareText size={15}/></span><strong>Aperçu du message</strong></div><p>{preview.body}</p></div>
        {(preview.tags || []).length > 0 && <div className="n12-tags">{(preview.tags || []).map(t => <span key={t}>#{t}</span>)}</div>}
        {preview.sourceUrl && <a className="n12-source-link" href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">Voir le message d’origine <ExternalLink size={15}/></a>}
        {preview.sourceChatId && preview.sourceMessageId && <div className="inline-help"><Send size={16}/> Référence du message Telegram conservée pour les transferts autorisés.</div>}
        <div className="modal-actions"><button className="btn btn-secondary" onClick={() => { setPreviewId(null); startEdit(preview); }}><Pencil size={15}/> Modifier</button><button className="btn btn-secondary" onClick={() => void copy(preview)}><Copy size={15}/> Copier</button><button className="btn btn-primary" onClick={() => setPreviewId(null)}><X size={15}/> Fermer</button></div>
      </div>
    </Modal>}
  </div>;
}
