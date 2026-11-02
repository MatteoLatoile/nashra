'use client';
import { SearchableSelect } from '@/components/searchable-select';
import { PageSkeleton } from '@/components/nashra-skeleton';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  CloudDownload, FilePlus2, FileText, Images, Info, LoaderCircle, LogOut,
  MessageSquareText, Plus, RefreshCw, Send, ShieldCheck, Smartphone,
  UsersRound, X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { AnnouncementImageUpload } from '@/components/announcement-image-upload';
import { useApp } from '@/lib/store';
import styles from './page.module.css';

type Status = {
  connected: boolean;
  configured?: boolean;
  publishingEnabled?: boolean;
  name?: string;
  username?: string;
  error?: string;
};
type Dialog = { id: string; title: string; group: boolean; channel: boolean };
type Message = { id: number; text: string; media: boolean; date: number; groupedId?: string | null };
type ImportResult = {
  ok: true; text: string; imageUrls: string[];
  photoCount: number; skipped: number; warnings: string[]; albumCount: number;
};
type Feedback = { good: boolean; text: string };
type AnnouncementTab = 'compose' | 'import';
type DestinationTab = 'telegram' | 'manual';

const categories = ['Immobilier', 'Services', 'Commerce', 'Événement', 'Autre'];
const destinationCategories = ['Général', 'Immobilier', 'Services', 'Commerce', 'Autre'];
const MAX_IMAGES = 10;
const validChatId = /^-?\d{3,30}$/;

async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const json = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(json.error || 'Une erreur est survenue.');
  return json;
}

function readableDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(timestamp * 1000));
  } catch { return ''; }
}

export default function TelegramPage() {
  const { data, addAnnouncement, addDestination, updateDestination, importTelegramAnnouncements, notify } = useApp();
  const confirm = useConfirm();

  // Authentification Telegram : les API existantes sont conservées.
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loginStep, setLoginStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Les deux espaces sont indépendants : changer la source d'un message
  // ne réinitialise jamais la destination en cours d'ajout.
  const [announcementTab, setAnnouncementTab] = useState<AnnouncementTab>('compose');
  const [destinationTab, setDestinationTab] = useState<DestinationTab>('telegram');
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [source, setSource] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageId, setMessageId] = useState(0);
  const [selectedDestination, setSelectedDestination] = useState('');
  const [telegramAuthorized, setTelegramAuthorized] = useState(false);

  // Rédaction d'une annonce sans quitter Telegram.
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Immobilier');
  const [images, setImages] = useState<string[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);

  // Ajout manuel d'une destination, y compris avant connexion à Telegram.
  const [manualName, setManualName] = useState('');
  const [manualHandle, setManualHandle] = useState('');
  const [manualCategory, setManualCategory] = useState('Général');
  const [manualAuthorized, setManualAuthorized] = useState(false);

  const connected = status?.connected === true;
  const authorizedCount = data.destinations.filter(d => d.authorized).length;
  const availableChats = useMemo(() => dialogs.filter(d => d.group || d.channel), [dialogs]);
  const selectedChat = availableChats.find(d => d.id === selectedDestination);
  const selectedMessage = messages.find(m => m.id === messageId);
  const existingDestination = selectedChat
    ? data.destinations.find(d => d.handle === selectedChat.id)
    : undefined;
  const alreadyImported = Boolean(selectedMessage && source && data.announcements.some(
    a => a.sourceChatId === source && a.sourceMessageId === selectedMessage.id,
  ));
  const maxBody = images.length > 0 ? 1024 : 4096;
  const canCompose = title.trim().length > 0 && (body.trim().length > 0 || images.length > 0)
    && body.length <= maxBody && images.length <= MAX_IMAGES;

  async function task<T>(name: string, run: () => Promise<T>, onSuccess?: (value: T) => void) {
    setBusy(name);
    setFeedback(null);
    try {
      const value = await run();
      onSuccess?.(value);
    } catch (error) {
      setFeedback({ good: false, text: error instanceof Error ? error.message : 'Erreur inconnue.' });
    } finally {
      setBusy('');
    }
  }

  async function refreshStatus() {
    try {
      const current = await api<Status>('/api/telegram/user/status');
      setStatus(current);
    } catch {
      setStatus({ connected: false, configured: false, error: 'Connexion Telegram indisponible pour le moment.' });
    }
  }

  useEffect(() => { void refreshStatus(); }, []);

  function sendCode() {
    if (!phone.trim() || busy) return;
    void task('code', () => api<{ ok: boolean }>('/api/telegram/user/start', { phone: phone.trim() }), () => {
      setLoginStep('code');
      setFeedback({ good: true, text: 'Code demandé. Consultez Telegram et saisissez le code reçu.' });
    });
  }

  function verify() {
    if (busy) return;
    const payload = loginStep === 'password' ? { password } : { code: code.trim() };
    void task('verify', () => api<{ needsPassword?: boolean; connected?: boolean }>(
      '/api/telegram/user/confirm', payload,
    ), result => {
      if (result.needsPassword) {
        setLoginStep('password');
        setFeedback({ good: true, text: 'Saisissez votre mot de passe Telegram à deux étapes.' });
      } else if (result.connected) {
        setCode(''); setPassword(''); setLoginStep('phone');
        void refreshStatus();
        setFeedback({ good: true, text: 'Votre compte Telegram est connecté.' });
      }
    });
  }

  function loadDialogs() {
    if (!connected || busy) return;
    void task('dialogs', () => api<{ dialogs: Dialog[] }>('/api/telegram/user/dialogs'), value => {
      setDialogs(value.dialogs);
      setFeedback({ good: true, text: `${value.dialogs.length} conversation(s) récupérée(s) depuis Telegram.` });
    });
  }

  function changeSource(chatId: string) {
    setSource(chatId);
    setMessages([]);
    setMessageId(0);
    if (!chatId || busy) return;
    void task('messages', () => api<{ messages: Message[] }>(
      `/api/telegram/user/messages?chat=${encodeURIComponent(chatId)}`,
    ), result => { setMessages(result.messages); });
  }

  function importMessage() {
    if (!selectedMessage || !source || busy || alreadyImported) return;
    const chosenId = selectedMessage.id;
    const chosenSource = source;
    const chatName = dialogs.find(d => d.id === chosenSource)?.title || 'Telegram';
    void task('import', () => api<ImportResult>('/api/telegram/user/import', {
      chatId: chosenSource, messageId: chosenId,
    }), result => {
      const added = importTelegramAnnouncements([{
        title: `${chatName} · #${chosenId}`,
        category: 'Telegram',
        body: result.text,
        sourceUrl: '',
        sourceChatId: chosenSource,
        sourceMessageId: chosenId,
        imageUrls: result.imageUrls,
        tags: [],
      }]);
      const info = `${result.imageUrls.length} photo(s) enregistrée(s)${result.albumCount > 1 ? ` · album de ${result.albumCount} messages` : ''}.`;
      const warning = result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
      setFeedback({
        good: added > 0 && result.warnings.length === 0,
        text: added > 0 ? `Annonce ajoutée à la bibliothèque. ${info}${warning}` : 'Ce message est déjà dans la bibliothèque.',
      });
    });
  }

  function saveAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCompose || busy) return;
    addAnnouncement({
      title: title.trim(), body: body.trim(), category, imageUrls: images, sourceUrl: '', tags: [],
    });
    setTitle(''); setBody(''); setImages([]); setShowPhotos(false);
    setFeedback({ good: true, text: 'Annonce enregistrée. Retrouvez-la dans Mes annonces pour la publier ou la programmer.' });
    notify('Annonce enregistrée dans votre bibliothèque.');
  }

  function saveTelegramDestination() {
    if (!selectedChat || !telegramAuthorized || busy) return;
    if (!validChatId.test(selectedChat.id)) {
      setFeedback({ good: false, text: 'Identifiant du groupe Telegram invalide.' });
      return;
    }
    if (existingDestination?.authorized) return;
    if (existingDestination) {
      updateDestination(existingDestination.id, {
        name: existingDestination.name, handle: existingDestination.handle,
        category: existingDestination.category, authorized: true,
      });
    } else {
      addDestination({ name: selectedChat.title, handle: selectedChat.id, category: 'Telegram', authorized: true });
    }
    setTelegramAuthorized(false);
    setFeedback({ good: true, text: `« ${selectedChat.title} » a été enregistré comme destination autorisée.` });
  }

  function saveManualDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = manualName.trim();
    const handle = manualHandle.trim();
    if (!name) return;
    if (handle && !validChatId.test(handle)) {
      setFeedback({ good: false, text: 'Utilisez un identifiant Telegram numérique (pas un @nom ni un lien t.me).' });
      return;
    }
    if (manualAuthorized && !handle) {
      setFeedback({ good: false, text: 'Un identifiant Telegram numérique est obligatoire pour autoriser la publication.' });
      return;
    }
    if (handle && data.destinations.some(d => d.handle === handle)) {
      setFeedback({ good: false, text: 'Cette destination est déjà enregistrée. Gérez-la dans Destinations.' });
      return;
    }
    addDestination({ name, handle, category: manualCategory, authorized: manualAuthorized });
    setManualName(''); setManualHandle(''); setManualCategory('Général'); setManualAuthorized(false);
    setFeedback({ good: true, text: 'Destination enregistrée. Retrouvez-la dans Destinations.' });
  }

  async function disconnect() {
    if (busy) return;
    const approved = await confirm({
      title: 'Déconnecter Telegram ?',
      description: 'Votre session Telegram sera supprimée de Nashra. Vos annonces et destinations seront conservées.',
      item: status?.name || 'Compte Telegram',
      itemLabel: 'COMPTE CONNECTÉ',
      confirmText: 'Déconnecter',
      tone: 'neutral',
    });
    if (!approved) return;
    void task('logout', () => api('/api/telegram/user/logout', {}), () => {
      setDialogs([]); setMessages([]); setSource(''); setMessageId(0);
      setSelectedDestination(''); setTelegramAuthorized(false);
      void refreshStatus();
      setFeedback({ good: true, text: 'Compte Telegram déconnecté. Vos annonces et destinations sont conservées.' });
    });
  }

  if (status === null) return <PageSkeleton variant="telegram" />;

  return <>
    <PageHeader
      eyebrow="NASHRA / VOTRE ESPACE TELEGRAM"
      title="Mon espace Telegram"
      description="Préparez vos annonces d’un côté, choisissez où les publier de l’autre."
    />

    <main className={styles.root}>
      <section className={styles.account} aria-label="État de la connexion Telegram">
        <div className={styles.accountIdentity}>
          <span className={styles.accountIcon}><Smartphone size={21} strokeWidth={1.8}/></span>
          <div className={styles.accountCopy}>
            <div className={styles.accountTitle}>
              <strong>{status === null ? 'Vérification de Telegram…' : connected ? (status.name || 'Compte Telegram connecté') : 'Connexion Telegram'}</strong>
              <span className={`${styles.state} ${connected ? styles.stateOn : styles.stateOff}`}>
                <span className={styles.dot}/>{status === null ? 'Vérification' : connected ? 'Connecté' : 'Non connecté'}
              </span>
            </div>
            <p>{connected ? (status?.username ? `@${status.username} · Compte personnel` : 'Votre compte personnel est prêt.') : 'Connectez Telegram pour importer vos messages et vos groupes.'}</p>
          </div>
        </div>
        <div className={styles.accountActions}>
          <button type="button" className={styles.iconButton} aria-label="Actualiser le statut Telegram" title="Actualiser" disabled={!!busy} onClick={() => void refreshStatus()}><RefreshCw size={17}/></button>
          {connected && <button type="button" className={styles.disconnect} onClick={() => void disconnect()} disabled={!!busy}><LogOut size={16}/> Déconnecter</button>}
        </div>
      </section>

      {status?.publishingEnabled === false && connected && <div className={styles.warning} role="status"><Info size={17}/> Les publications Telegram sont momentanément désactivées côté serveur.</div>}

      {status?.configured === false && <div className={styles.warning} role="status"><Info size={17}/> Le service Telegram est momentanément indisponible. Réessayez ou contactez le support Nashra.</div>}

      {!connected && status !== null && <section className={styles.connectBox} aria-labelledby="ntg-connect-heading">
        <div className={styles.connectAbout}>
          <span className={styles.eyebrow}>CONNEXION SÉCURISÉE</span>
          <h2 id="ntg-connect-heading">Connectez votre compte Telegram.</h2>
          <p>Vos annonces seront publiées depuis votre propre compte, sans ajouter de bot à vos groupes.</p>
          <div className={styles.connectTrust}><ShieldCheck size={17}/> La connexion est gérée par Nashra. Aucun paramétrage technique n’est demandé.</div>
        </div>
        <div className={styles.connectForm}>
          {loginStep === 'phone' ? <>
            <label className={styles.field}>Numéro de téléphone Telegram
              <input type="tel" autoComplete="tel" inputMode="tel" placeholder="+33612345678" value={phone} onChange={e => setPhone(e.target.value)}/>
            </label>
            <button className={styles.primaryButton} type="button" disabled={!!busy || !phone.trim()} onClick={sendCode}>
              {busy === 'code' ? <LoaderCircle className={styles.spin} size={17}/> : <ArrowRight size={17}/>}
              Recevoir mon code
            </button>
          </> : <>
            <label className={styles.field}>{loginStep === 'password' ? 'Mot de passe Telegram à deux étapes' : 'Code reçu sur Telegram'}
              <input type={loginStep === 'password' ? 'password' : 'text'} autoComplete="off"
                placeholder={loginStep === 'password' ? 'Votre mot de passe Telegram' : 'Code de connexion'}
                value={loginStep === 'password' ? password : code}
                onChange={e => loginStep === 'password' ? setPassword(e.target.value) : setCode(e.target.value)}/>
            </label>
            <button className={styles.primaryButton} type="button" disabled={!!busy || !(loginStep === 'password' ? password : code.trim())} onClick={verify}>
              {busy === 'verify' ? <LoaderCircle className={styles.spin} size={17}/> : <Check size={17}/>}
              Confirmer la connexion
            </button>
            <button className={styles.textButton} type="button" disabled={!!busy} onClick={() => setLoginStep('phone')}>Changer de numéro</button>
          </>}
        </div>
      </section>}

      <div className={styles.workflowHeading}>
        <div>
          <span className={styles.eyebrow}>VOTRE ESPACE DE TRAVAIL</span>
          <h2>Deux choses à préparer. <span>Une publication prête à partir.</span></h2>
        </div>
        <p>Chaque espace est indépendant : préparez votre contenu et vos destinations dans l’ordre qui vous convient.</p>
      </div>

      <div className={styles.workspaceGrid}>
        {/* PANNEAU 1 : contenu ; aucun groupe n'est requis pour créer une annonce. */}
        <section className={`${styles.workspaceCard} ${styles.announcementCard}`} aria-labelledby="ntg-announcement-heading">
          <header className={styles.cardHeader}>
            <div className={styles.cardTopline}><span className={styles.step}>01 · LE CONTENU</span><span className={styles.count}>{data.announcements.length} annonce(s)</span></div>
            <div className={styles.cardHeadline}>
              <span className={styles.bigIcon}><FileText size={23}/></span>
              <div><h3 id="ntg-announcement-heading">Préparer une annonce</h3><p>Créez un message ou importez-le depuis Telegram.</p></div>
            </div>
          </header>
          <div className={styles.cardBody}>
            <div className={styles.tabs} role="tablist" aria-label="Mode de préparation de l’annonce">
              <button type="button" role="tab" aria-selected={announcementTab === 'compose'} className={announcementTab === 'compose' ? styles.tabSelected : ''} onClick={() => setAnnouncementTab('compose')}><FilePlus2 size={16}/> Rédiger</button>
              <button type="button" role="tab" aria-selected={announcementTab === 'import'} className={announcementTab === 'import' ? styles.tabSelected : ''} onClick={() => setAnnouncementTab('import')}><CloudDownload size={16}/> Importer de Telegram</button>
            </div>
            {announcementTab === 'compose' ? <form className={styles.editorForm} onSubmit={saveAnnouncement}>
              <label className={styles.field}>Titre de l’annonce <span>*</span>
                <input maxLength={90} required placeholder="Ex. Appartement meublé à Médine" value={title} onChange={e => setTitle(e.target.value)}/>
              </label>
              <label className={styles.field}>Catégorie
                <span className={styles.selectWrap}><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={16}/></span>
              </label>
              <label className={styles.field}>Texte de la publication
                <textarea rows={5} maxLength={maxBody} placeholder="Rédigez votre annonce ici…" value={body} onChange={e => setBody(e.target.value)}/>
                <span className={styles.counter}>{body.length.toLocaleString('fr-FR')} / {maxBody.toLocaleString('fr-FR')} caractères</span>
              </label>
              <div className={styles.mediaArea}>
                <div className={styles.mediaTop}><div><Images size={17}/><span>Photos <small>· Facultatif, jusqu’à 10</small></span></div><button type="button" className={styles.tinyButton} onClick={() => setShowPhotos(v => !v)} aria-expanded={showPhotos}>{showPhotos ? 'Masquer' : 'Ajouter'} <Plus size={15}/></button></div>
                {showPhotos && <div className={styles.mediaUpload}>
                  <AnnouncementImageUpload currentCount={images.length} maxCount={MAX_IMAGES}
                    onUploaded={urls => setImages(previous => [...new Set([...previous, ...urls])].slice(0, MAX_IMAGES))}/>
                  {images.length > 0 && <div className={styles.photoList}>{images.map((url, i) => <div className={styles.photoItem} key={url}>
                    <span>Photo {i + 1}</span><button aria-label={`Retirer la photo ${i + 1}`} type="button" onClick={() => setImages(previous => previous.filter(x => x !== url))}><X size={15}/></button>
                  </div>)}</div>}
                </div>}
              </div>
              <div className={styles.formFooter}><span><ShieldCheck size={14}/> Brouillon non publié</span><button className={styles.primaryButton} type="submit" disabled={!!busy || !canCompose}><Check size={17}/> Enregistrer l’annonce</button></div>
            </form> : <div className={styles.importForm}>
              {!connected ? <div className={styles.emptyState}><Smartphone size={22}/><strong>Connexion Telegram nécessaire</strong><span>Connectez votre compte ci-dessus pour importer ses messages.</span></div> : <>
                <div className={styles.miniToolbar}><span>{dialogs.length ? `${dialogs.length} conversation(s) chargée(s)` : 'Importez vos discussions accessibles'}</span><button type="button" className={styles.smallButton} disabled={!!busy} onClick={loadDialogs}>{busy === 'dialogs' ? <LoaderCircle className={styles.spin} size={15}/> : <RefreshCw size={15}/>} {dialogs.length ? 'Actualiser' : 'Charger mes conversations'}</button></div>
                <div className={styles.field}><span>Conversation source</span><SearchableSelect value={source} onChange={changeSource} ariaLabel="Conversation source"
  placeholder="Choisir une conversation" searchPlaceholder="Rechercher une conversation…"
  disabled={!!busy || !dialogs.length} options={dialogs.map(d => ({ value: d.id, label: d.title,
  detail: d.channel ? 'Canal Telegram' : d.group ? 'Groupe Telegram' : 'Conversation' }))}/></div>
                <div className={styles.field}><span>Message à importer</span><SearchableSelect value={String(messageId)} onChange={value => setMessageId(Number(value))}
  ariaLabel="Message à importer" placeholder={busy === 'messages' ? 'Chargement…' : messages.length === 0 && source ? 'Aucun message disponible' : 'Choisir un message'}
  searchPlaceholder="Rechercher dans les messages chargés…" disabled={!!busy || !source || !messages.length}
  options={messages.map(m => ({ value: String(m.id), label: '#' + m.id + ' — ' + (m.text || '[Média]').replace(/\s+/g, ' ').slice(0, 110),
    detail: readableDate(m.date) + (m.media ? ' · Média' : '') }))}/></div>
                {selectedMessage && <div className={styles.messagePreview}><span className={styles.previewLabel}><MessageSquareText size={14}/> APERÇU DU MESSAGE {selectedMessage.media ? '· MÉDIA' : ''}{selectedMessage.groupedId ? ' · ALBUM' : ''}</span><p>{selectedMessage.text?.slice(0, 380) || '[Message contenant un média]'}</p></div>}
                {selectedMessage && <p className={styles.supportText}>Texte et jusqu’à 10 photos importés. Les vidéos et autres fichiers ne sont pas pris en charge.</p>}
                <div className={styles.formFooter}><span><ShieldCheck size={14}/> Aucun envoi lors de l’import</span><button type="button" className={styles.primaryButton} onClick={importMessage} disabled={!!busy || !selectedMessage || alreadyImported}>{busy === 'import' ? <LoaderCircle className={styles.spin} size={16}/> : <CloudDownload size={16}/>} {alreadyImported ? 'Déjà importée' : 'Importer l’annonce'}</button></div>
              </>}
            </div>}
          </div>
        </section>

        {/* PANNEAU 2 : destinations indépendantes des annonces. */}
        <section className={`${styles.workspaceCard} ${styles.destinationCard}`} aria-labelledby="ntg-destination-heading">
          <header className={styles.cardHeader}>
            <div className={styles.cardTopline}><span className={styles.step}>02 · LE LIEU DE PUBLICATION</span><span className={styles.count}>{authorizedCount} autorisée(s)</span></div>
            <div className={styles.cardHeadline}>
              <span className={`${styles.bigIcon} ${styles.destinationIcon}`}><UsersRound size={23}/></span>
              <div><h3 id="ntg-destination-heading">Créer une destination</h3><p>Choisissez un groupe ou un canal dans lequel vous pouvez publier.</p></div>
            </div>
          </header>
          <div className={styles.cardBody}>
            <div className={styles.tabs} role="tablist" aria-label="Mode d’ajout des destinations">
              <button type="button" role="tab" aria-selected={destinationTab === 'telegram'} className={destinationTab === 'telegram' ? styles.tabSelected : ''} onClick={() => setDestinationTab('telegram')}><UsersRound size={16}/> Depuis Telegram</button>
              <button type="button" role="tab" aria-selected={destinationTab === 'manual'} className={destinationTab === 'manual' ? styles.tabSelected : ''} onClick={() => setDestinationTab('manual')}><Plus size={16}/> Manuellement</button>
            </div>
            {destinationTab === 'telegram' ? <div className={styles.destinationForm}>
              {!connected ? <div className={styles.emptyState}><Smartphone size={22}/><strong>Connexion Telegram nécessaire</strong><span>Connectez votre compte pour retrouver vos groupes et canaux.</span><button className={styles.textButton} type="button" onClick={() => setDestinationTab('manual')}>Ajouter manuellement à la place <ArrowRight size={15}/></button></div> : <>
                <div className={styles.miniToolbar}><span>{availableChats.length ? `${availableChats.length} groupe(s) ou canal(aux)` : 'Récupérez les groupes de votre compte'}</span><button className={styles.smallButton} type="button" disabled={!!busy} onClick={loadDialogs}>{busy === 'dialogs' ? <LoaderCircle className={styles.spin} size={15}/> : <RefreshCw size={15}/>} {dialogs.length ? 'Actualiser' : 'Charger mes conversations'}</button></div>
                <div className={styles.field}><span>Groupe ou canal</span><SearchableSelect value={selectedDestination} onChange={value => { setSelectedDestination(value); setTelegramAuthorized(false); }}
  ariaLabel="Destination Telegram" placeholder="Choisir une destination" searchPlaceholder="Rechercher un groupe ou canal…"
  disabled={!!busy || !availableChats.length}
  options={availableChats.map(d => ({ value: d.id, label: d.title, detail: d.channel ? 'Canal Telegram' : 'Groupe Telegram' }))}/></div>
                {selectedChat && <div className={styles.destinationInfo}><span className={styles.destinationInfoIcon}><UsersRound size={17}/></span><div><strong>{selectedChat.title}</strong><small>{selectedChat.channel ? 'Canal Telegram' : 'Groupe Telegram'} · ID {selectedChat.id}</small></div>{existingDestination?.authorized && <span className={styles.savedTag}><Check size={13}/> Enregistré</span>}</div>}
                {selectedChat && !existingDestination?.authorized && <label className={styles.consent}><input type="checkbox" checked={telegramAuthorized} onChange={e => setTelegramAuthorized(e.target.checked)}/><span><strong>Je suis autorisé à publier ici.</strong><small>Je respecte les règles du groupe ou du canal et n’envoie pas de publicité non sollicitée.</small></span></label>}
                <div className={styles.formFooter}><span><ShieldCheck size={14}/> Autorisation requise</span><button className={styles.secondaryButton} type="button" disabled={!!busy || !selectedChat || !telegramAuthorized || Boolean(existingDestination?.authorized)} onClick={saveTelegramDestination}>{existingDestination?.authorized ? <Check size={16}/> : <Plus size={16}/>} {existingDestination?.authorized ? 'Déjà enregistrée' : 'Ajouter la destination'}</button></div>
              </>}
            </div> : <form className={styles.destinationForm} onSubmit={saveManualDestination}>
              <label className={styles.field}>Nom de la destination <span>*</span><input maxLength={100} required value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Ex. Groupe annonces Médine"/></label>
              <label className={styles.field}>ID Telegram numérique <small>· Requis pour publier</small><input value={manualHandle} onChange={e => setManualHandle(e.target.value)} placeholder="Ex. -1001234567890" inputMode="text"/></label>
              <label className={styles.field}>Catégorie
                <span className={styles.selectWrap}><select value={manualCategory} onChange={e => setManualCategory(e.target.value)}>{destinationCategories.map(c => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={16}/></span>
              </label>
              <label className={styles.consent}><input type="checkbox" checked={manualAuthorized} onChange={e => setManualAuthorized(e.target.checked)}/><span><strong>Je confirme avoir l’autorisation d’y publier.</strong><small>Vous pouvez aussi enregistrer cette destination sans l’autoriser pour le moment.</small></span></label>
              <div className={styles.formFooter}><span><ShieldCheck size={14}/> Pas de publication automatique</span><button className={styles.secondaryButton} type="submit" disabled={!!busy || !manualName.trim() || (manualAuthorized && !manualHandle.trim())}><Plus size={16}/> Ajouter la destination</button></div>
            </form>}
          </div>
        </section>
      </div>

      {feedback && <div className={`${styles.feedback} ${feedback.good ? styles.feedbackGood : styles.feedbackError}`} role="status"><span>{feedback.good ? <CheckCircle2 size={19}/> : <Info size={19}/>}</span><p>{feedback.text}</p><button type="button" aria-label="Fermer le message" onClick={() => setFeedback(null)}><X size={16}/></button></div>}

      <section className={styles.nextStep} aria-labelledby="ntg-next-heading">
        <div className={styles.nextCopy}><span className={styles.eyebrow}>03 · PASSER À L’ACTION</span><h2 id="ntg-next-heading">Tout est prêt pour publier ?</h2><p>Une fois l’annonce et la destination enregistrées, choisissez quand envoyer votre message.</p><div className={styles.readyIndicators}><span><FileText size={14}/> {data.announcements.length} annonce(s)</span><span><UsersRound size={14}/> {authorizedCount} destination(s) autorisée(s)</span></div></div>
        <div className={styles.nextActions}>
          <Link className={styles.primaryButton} href="/annonces"><Send size={17}/> Publier une annonce <ArrowRight size={16}/></Link>
          <Link className={styles.secondaryButton} href="/campagnes"><CalendarDays size={17}/> Programmer</Link>
          <Link className={styles.tertiaryLink} href="/groupes"><BookOpen size={15}/> Gérer mes destinations <ArrowRight size={14}/></Link>
        </div>
      </section>
      <p className={styles.footer}><Info size={15}/> Nashra publie depuis votre compte Telegram uniquement dans les groupes où vous êtes autorisé. Les envois restent soumis aux limites de Telegram et à votre forfait.</p>
    </main>
  </>;
}
