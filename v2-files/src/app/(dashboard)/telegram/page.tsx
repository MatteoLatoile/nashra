'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CloudDownload, ExternalLink, Info, LoaderCircle, LogOut, Radio, Send, ShieldCheck, Smartphone, UsersRound } from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useApp, type Method } from '@/lib/store';

type Status = { connected: boolean; configured?: boolean; publishingEnabled?: boolean; name?: string; username?: string; error?: string };
type Dialog = { id: string; title: string; group: boolean; channel: boolean };
type Message = { id: number; text: string; media: boolean; date: number; groupedId?: string | null };
type ImportResult = { ok: true; text: string; imageUrls: string[]; photoCount: number; skipped: number; warnings: string[]; albumCount: number };
type PlannedSend = { source: string; message: number; destination: string; mode: Method };

async function api<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, { method: body ? 'POST' : 'GET', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}), cache: 'no-store' });
  const obj = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(obj.error || 'Erreur serveur');
  return obj;
}
export default function TelegramPage() {
  const { data, addDestination, importTelegramAnnouncements, recordPublication, syncStatus } = useApp();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [source, setSource] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageId, setMessageId] = useState(0);
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState<Method>('forward');
  const [authorized, setAuthorized] = useState(false);
  const [feedback, setFeedback] = useState<{ good: boolean; text: string } | null>(null);
  const [planned, setPlanned] = useState<PlannedSend | null>(null);
  const [plannedLoading, setPlannedLoading] = useState(false);
  const destinations = useMemo(() => dialogs.filter(d => (d.group || d.channel) && d.id !== source), [dialogs, source]);
  const dest = destinations.find(d => d.id === destination);
  const msg = messages.find(m => m.id === messageId);
  const saved = !!(dest && data.destinations.some(d => d.authorized && d.handle === dest.id));
  async function task<T>(name: string, fn: () => Promise<T>, success?: (value: T) => void) {
    setBusy(name); setFeedback(null);
    try { const result = await fn(); success?.(result); }
    catch (e) { setFeedback({ good: false, text: e instanceof Error ? e.message : 'Erreur inconnue' }); }
    finally { setBusy(''); }
  }
  async function refresh() {
    const info = await api<Status>('/api/telegram/user/status').catch(e => ({ connected: false, configured: false, error: String(e) }));
    setStatus(info);
  }
  useEffect(() => { void refresh(); }, []);
  // Les campagnes transmises par lien ouvrent une revue MANUELLE, jamais un envoi.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source') || '';
    const destination = params.get('destination') || '';
    const message = Number(params.get('message'));
    const mode = params.get('mode') === 'repost' ? 'repost' : 'forward';
    if (/^[-\d]{3,30}$/.test(source) && /^[-\d]{3,30}$/.test(destination) && Number.isSafeInteger(message) && message > 0) {
      setPlanned({ source, destination, message, mode });
    }
  }, []);
  useEffect(() => {
    if (!status?.connected || !planned || plannedLoading) return;
    setPlannedLoading(true);
    void api<{ dialogs: Dialog[] }>('/api/telegram/user/dialogs').then(result => {
      setDialogs(result.dialogs);
      const sourceFound = result.dialogs.some(d => d.id === planned.source);
      const destFound = result.dialogs.some(d => d.id === planned.destination);
      if (!sourceFound || !destFound) {
        setFeedback({ good: false, text: 'La source ou la destination de cette campagne n’est pas dans les conversations accessibles. Chargez vos conversations et vérifiez les identifiants.' });
        return;
      }
      setSource(planned.source); setDestination(planned.destination); setMode(planned.mode);
      return api<{ messages: Message[] }>(`/api/telegram/user/messages?chat=${encodeURIComponent(planned.source)}&id=${planned.message}`).then(result => {
        setMessages(result.messages);
        if (result.messages.some(m => m.id === planned.message)) {
          setMessageId(planned.message);
          setFeedback({ good: true, text: 'Campagne chargée pour relecture. Aucun message n’a été envoyé. Vérifiez les autorisations du groupe avant confirmation.' });
        } else {
          setFeedback({ good: false, text: 'Le message original est inaccessible. Sélectionnez une autre annonce.' });
        }
      });
    }).catch(e => setFeedback({ good: false, text: e instanceof Error ? e.message : 'Chargement impossible.' })).finally(() => { setPlanned(null); setPlannedLoading(false); });
    // Un unique chargement par lien de campagne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, planned]);
  const sendCode = () => void task('code', () => api<{ ok: boolean }>('/api/telegram/user/start', { phone }), () => {
    setStep('code'); setFeedback({ good: true, text: 'Code demandé. Vérifiez votre application Telegram, puis saisissez-le ici.' });
  });
  const verify = () => void task('verify', () => api<{ needsPassword?: boolean; connected?: boolean }>('/api/telegram/user/confirm', step === 'password' ? { password } : { code }), result => {
    if (result.needsPassword) { setStep('password'); setFeedback({ good: true, text: 'Votre compte utilise un mot de passe Telegram à deux étapes.' }); }
    else if (result.connected) { setCode(''); setPassword(''); setStep('phone'); void refresh(); setFeedback({ good: true, text: 'Compte personnel Telegram connecté avec succès.' }); }
  });
  const loadDialogs = () => void task('dialogs', () => api<{ dialogs: Dialog[] }>('/api/telegram/user/dialogs'), result => {
    setDialogs(result.dialogs);
    setFeedback({ good: true, text: `${result.dialogs.length} conversations récupérées depuis votre compte personnel.` });
  });
  const loadMessages = (chat: string) => {
    setSource(chat); setMessages([]); setMessageId(0); setDestination('');
    if (!chat) return;
    void task('messages', () => api<{ messages: Message[] }>(`/api/telegram/user/messages?chat=${encodeURIComponent(chat)}`), result => { setMessages(result.messages); });
  };
  const alreadyImported = Boolean(msg && source && data.announcements.some(a => a.sourceChatId === source && a.sourceMessageId === msg.id));
  const importMessage = () => {
    if (!msg || !source || busy || alreadyImported) return;
    const selectedId = msg.id;
    const selectedSource = source;
    const title = dialogs.find(d => d.id === selectedSource)?.title || 'Telegram';
    void task('import', () => api<ImportResult>('/api/telegram/user/import', {
      chatId: selectedSource, messageId: selectedId,
    }), result => {
      const count = importTelegramAnnouncements([{
        title: `${title} · #${selectedId}`,
        category: 'Telegram',
        body: result.text,
        sourceUrl: '',
        sourceChatId: selectedSource,
        sourceMessageId: selectedId,
        imageUrls: result.imageUrls,
        tags: [],
      }]);
      const details = `${result.imageUrls.length} photo(s) enregistrée(s)${result.albumCount > 1 ? ` · album de ${result.albumCount} messages` : ''}.`;
      const warning = result.warnings.length ? ` Attention : ${result.warnings.join(' ')}` : '';
      setFeedback({ good: count > 0 && result.warnings.length === 0,
        text: count ? `Annonce importée dans votre bibliothèque. ${details}${warning}` : 'Ce message est déjà présent dans votre bibliothèque.' });
    });
  };
  const allowGroup = () => {
    if (!dest || !authorized) return;
    if (!saved) addDestination({ name: dest.title, handle: dest.id, category: 'Telegram', authorized: true });
    setFeedback({ good: true, text: `Destination « ${dest.title} » enregistrée comme autorisée.` });
  };
  const publish = async () => {
    if (!msg || !dest || !saved || busy || !status?.publishingEnabled || syncStatus !== 'synced') return;
    const approved = await confirm({
      title: 'Confirmer la publication',
      description: `Votre compte Telegram personnel enverra le message n°${msg.id}. Vérifiez le groupe et le mode d’envoi avant de continuer.`,
      item: dest.title,
      itemLabel: 'GROUPE DESTINATAIRE',
      note: `${mode === 'forward' ? 'Transfert du message original' : 'Republication du contenu accessible'} · Publiez uniquement avec l’autorisation des administrateurs.`,
      confirmText: 'Publier maintenant',
      tone: 'warning',
    });
    if (!approved) return;
    void task('publish', () => api<{ ok: true; messageId: number }>('/api/telegram/user/publish', {
      sourceChatId: source, sourceMessageId: msg.id, destinationChatId: dest.id, mode, confirmed: true,
    }), result => {
      recordPublication(`${dialogs.find(d => d.id === source)?.title ?? 'Telegram'} #${msg.id}`, dest.title, mode);
      setFeedback({ good: true, text: `Message n°${result.messageId} envoyé depuis votre compte dans « ${dest.title} » !` });
    });
  };
  const disconnect = async () => {
    if (busy) return;
    const approved = await confirm({
      title: 'Déconnecter Telegram ?',
      description: 'Votre session Telegram sera retirée de Nashra. Vos annonces enregistrées dans votre espace ne seront pas supprimées.',
      item: status?.name || 'Mon compte Telegram',
      itemLabel: 'COMPTE CONNECTÉ',
      confirmText: 'Déconnecter',
      tone: 'neutral',
    });
    if (!approved) return;
    void task('logout', () => api('/api/telegram/user/logout', {}), () => { setDialogs([]); setMessages([]); setSource(''); void refresh(); });
  };

  return <>
    <PageHeader eyebrow="NASHRA CONNECT · COMPTE PERSONNEL" title="Telegram" description="Votre compte personnel, vos annonces et vos groupes — sans bot." />
    <div className="tg-hero">
      <div className="tg-hero-copy">
        <div className="tg-label"><Radio size={14}/> CONNEXION PERSONNELLE</div>
        <h2>Votre compte.<br/><span>Vos publications.</span></h2>
        <p>Utilisez votre identité Telegram habituelle. Importez un message existant, choisissez un groupe autorisé et confirmez l'envoi.</p>
      </div>
      <div className="tg-connect-card"><span className={status?.connected ? 'tg-connected-dot' : 'tg-disconnected-dot'} />
        <div><strong>{status?.connected ? status.name || 'Compte connecté' : 'Compte à connecter'}</strong><small>{status?.connected ? (status.username ? `@${status.username}` : 'Session chiffrée') : 'Telegram MTProto · teleproto'}</small></div>
        {status?.connected ? <CheckCircle2 size={20}/> : <Smartphone size={20}/>}</div>
    </div>
    {status?.connected && !status.publishingEnabled && <div className="n5-warning" style={{marginBottom: 18}}><Info size={17}/> Envois réels volontairement désactivés. Vous pouvez importer et préparer vos campagnes. Après la fin de toute restriction Telegram, ajoutez NASHRA_PUBLISHING_ENABLED=1 dans votre .env.local pour autoriser les confirmations manuelles.</div>}
    <div className="notice-row"><ShieldCheck size={19}/><div><strong>Vos messages apparaissent sous votre propre nom Telegram</strong><span>Nashra n'est pas un bot. Publiez uniquement dans les groupes qui vous autorisent à partager vos annonces. Envoi manuel unitaire pour le moment ; la planification serveur n'est pas encore active.</span></div></div>
    {status?.error && <div className="tg-feedback tg-feedback-error"><Info size={16}/><span>{status.error}</span></div>}
    {!status?.connected ? <div className="tg-three-steps">
      <section className="settings-card tg-action-card" style={{gridColumn:'span 2'}}>
        <div className="tg-step-tag">ÉTAPE 01 · CONNEXION À VOTRE COMPTE</div>
        <h3>Se connecter avec son numéro</h3>
        <p>Renseignez d'abord <code>TELEGRAM_API_ID</code>, <code>TELEGRAM_API_HASH</code> et <code>NASHRA_SESSION_ENCRYPTION_KEY</code> dans <code>.env.local</code>. Puis saisissez votre numéro : Telegram vous demandera un code, et éventuellement votre mot de passe à deux étapes.</p>
        <p><a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="tg-small-link">Obtenir mes identifiants développeur <ExternalLink size={14}/></a></p>
        {step === 'phone' ? <div className="form-stack"><label className="field-label">Votre numéro Telegram<input type="tel" placeholder="+33612345678" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label><button className="btn btn-primary" disabled={!!busy} onClick={sendCode}>{busy === 'code' ? <LoaderCircle size={16}/> : <Smartphone size={16}/>} Recevoir le code</button></div>
          : <div className="form-stack"><label className="field-label">{step === 'password' ? 'Mot de passe Telegram à deux étapes' : 'Code reçu sur Telegram'}<input autoComplete="off" type={step === 'password' ? 'password' : 'text'} placeholder={step === 'password' ? 'Mot de passe à deux étapes' : 'Code de connexion'} value={step === 'password' ? password : code} onChange={e => step === 'password' ? setPassword(e.target.value) : setCode(e.target.value)} /></label><button className="btn btn-primary" disabled={!!busy} onClick={verify}>{busy === 'verify' ? <LoaderCircle size={16}/> : <CheckCircle2 size={16}/>} Valider la connexion</button><button className="btn btn-secondary" onClick={() => setStep('phone')}>Changer de numéro</button></div>}
      </section>
      <section className="settings-card tg-action-card"><div className="tg-step-tag">SÉCURITÉ</div><div className="tg-heading-icon"><ShieldCheck size={21}/></div><h3>Session chiffrée</h3><p>Votre session est stockée chiffrée dans votre espace Supabase. Aucun mot de passe ou code Telegram n'est enregistré. N'ajoutez jamais vos identifiants confidentiels dans le chat.</p></section>
    </div> : <>
      <div className="tg-three-steps">
        <section className="settings-card tg-action-card"><div className="tg-step-tag">ÉTAPE 01 · MES CONVERSATIONS</div><div className="tg-heading-icon"><UsersRound size={21}/></div><h3>Mes groupes & canaux</h3><p>Chargez les conversations accessibles à votre compte personnel. Aucun ajout de bot n'est nécessaire.</p><button className="btn btn-secondary tg-action" onClick={loadDialogs} disabled={!!busy}>{busy === 'dialogs' ? <LoaderCircle size={16}/> : <UsersRound size={16}/>} Charger mes conversations</button><div className="tg-card-bottom"><span>{dialogs.length} conversations</span><Badge tone="positive">Personnel</Badge></div></section>
        <section className="settings-card tg-action-card"><div className="tg-step-tag">ÉTAPE 02 · MES ANNONCES</div><div className="tg-heading-icon"><CloudDownload size={21}/></div><h3>Importer un message</h3><p>Choisissez la discussion où se trouve votre publication existante, puis un message. Vous pouvez aussi utiliser « Messages enregistrés » dans Telegram.</p><div className="tg-card-bottom"><span>Jusqu'aux 40 derniers messages du fil choisi</span></div></section>
        <section className="settings-card tg-action-card"><div className="tg-step-tag">ÉTAPE 03 · ENVOI</div><div className="tg-heading-icon"><Send size={21}/></div><h3>Publier depuis mon compte</h3><p>Choisissez un groupe où vos annonces sont autorisées. Publiez manuellement, avec confirmation.</p><div className="tg-card-bottom"><span>Un groupe à la fois</span><Badge>Contrôle</Badge></div></section>
      </div>
      <section className="settings-card tg-publisher">
        <div className="tg-publisher-title"><div><div className="tg-step-tag">PUBLICATION PERSONNELLE</div><h2>Préparer une annonce</h2><p>Pas de bot, pas d'envoi massif. Les messages restent soumis aux règles Telegram.</p></div></div>
        <div className="tg-form-grid">
          <label className="field-label">Conversation source<select value={source} onChange={e => loadMessages(e.target.value)} disabled={!!busy}><option value="">Choisir la source</option>{dialogs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
          <label className="field-label">Message existant<select value={messageId} onChange={e => setMessageId(Number(e.target.value))} disabled={!!busy || !source}><option value={0}>Choisir un message</option>{messages.map(m => <option key={m.id} value={m.id}>#{m.id} — {(m.text || '[Média]').slice(0, 110)}</option>)}</select></label>
        </div>
        {msg && <div className="tg-hint"><Info size={17}/><span>{msg.media ? 'Média disponible · ' : ''}{msg.groupedId ? 'Album Telegram · ' : ''}{msg.text?.slice(0, 350) || '[Message contenant un média]'}</span></div>}
        {msg && <div className="n20-telegram-media-note"><strong>Importation complète :</strong> Nashra récupère le texte et jusqu’à 10 photos accessibles depuis ce message ou son album. Les vidéos et autres fichiers ne sont pas importés. Les photos sont enregistrées dans votre bucket Supabase public.</div>}
        {msg && <button type="button" className="btn btn-secondary" disabled={!!busy || alreadyImported} onClick={importMessage}>{busy === 'import' ? <LoaderCircle className="n13-spinner" size={16}/> : <CloudDownload size={16}/>} {alreadyImported ? 'Déjà dans ma bibliothèque' : busy === 'import' ? 'Importation en cours…' : 'Importer texte et photos'}</button>}
        {msg && !alreadyImported && <div className="n20-tip">Aucune publication n’est envoyée lors de l’importation. Les permissions d’accès aux messages et médias restent celles de votre compte Telegram.</div>}
        <div className="tg-form-grid" style={{marginTop:24}}><label className="field-label">Groupe ou canal destinataire<select disabled={!!busy || !source} value={destination} onChange={e => { setDestination(e.target.value); setAuthorized(false); }}><option value="">Choisir un groupe</option>{destinations.map(d => <option value={d.id} key={d.id}>{d.title}</option>)}</select></label>
          <label className="field-label">Mode d'envoi<select value={mode} onChange={e => setMode(e.target.value as Method)}><option value="forward">Transfert (mention « Transféré de… »)</option><option value="repost">Republication (copie accessible du contenu)</option></select></label></div>
        {dest && !saved && <div className="form-stack"><label className="check-field"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)}/><span><strong>Les administrateurs autorisent mes publications dans ce groupe.</strong><small>Je respecterai les règles du groupe et n'enverrai pas de publicité non sollicitée.</small></span></label><button className="btn btn-secondary" disabled={!authorized} onClick={allowGroup}><ShieldCheck size={16}/> Enregistrer ce groupe comme autorisé</button></div>}
        {dest && saved && <div className="tg-feedback tg-feedback-success"><CheckCircle2 size={16}/>Destination autorisée enregistrée dans votre espace.</div>}
        <div className="tg-publish-actions"><button className="btn btn-primary" disabled={!!busy || !msg || !dest || !saved || syncStatus !== 'synced' || !status?.publishingEnabled} onClick={publish}><Send size={16}/> {busy === 'publish' ? 'Publication en cours…' : 'Publier depuis MON compte'}</button><button className="btn btn-secondary" disabled={!!busy} onClick={disconnect}><LogOut size={16}/> Déconnecter Telegram</button></div>
      </section>
    </>}
    {feedback && <div role="status" className={`tg-feedback ${feedback.good ? 'tg-feedback-success' : 'tg-feedback-error'}`} style={{marginTop:15}}>{feedback.good ? <CheckCircle2 size={16}/> : <Info size={16}/>}<span>{feedback.text}</span></div>}
    <p className="tg-footer-note"><Info size={15}/> Nashra V2.0 : import de messages et de photos, calendrier et revue manuelle ; aucune exécution automatique. Session chiffrée côté serveur.</p>
  </>;
}
