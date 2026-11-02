'use client';
import { isLocale, localeForIntl } from '@/lib/i18n';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';

export type Method = 'forward' | 'repost';
export type Announcement = { id: string; title: string; category: string; body: string; sourceUrl: string; sourceChatId?: string; sourceMessageId?: number; imageUrls?: string[]; tags?: string[]; updatedAt?: string; createdAt: string };
export type Destination = { id: string; name: string; handle: string; category: string; authorized: boolean; createdAt: string };
// Les anciens champs restent présents pour les pages et données V0.5.
export type Campaign = {
  id: string;
  name: string;
  announcementId: string; // compatibilité avec les anciennes campagnes
  announcementIds?: string[];
  destinationIds: string[];
  method: Method;
  scheduledAt: string; // premier créneau, compatibilité avec le tableau de bord
  scheduledDates?: string[];
  recurrence?: { mode: 'once' | 'weekly'; weekdays: number[]; weeks: number } |
    { mode: 'interval'; intervalDays: number; timeZone: string; until?: string | null };
  status: 'scheduled' | 'paused';
  nativeTelegram?: boolean; // Telegram itself queues and sends scheduled messages, PC can be off.
  createdAt: string;
};
export type Activity = { id: string; title: string; detail: string; createdAt: string };
export type AppData = { announcements: Announcement[]; destinations: Destination[]; campaigns: Campaign[]; activity: Activity[] };

type AddAnnouncementInput = Omit<Announcement, 'id' | 'createdAt'>;
type AddDestinationInput = Omit<Destination, 'id' | 'createdAt'>;
type AddCampaignInput = Omit<Campaign, 'id' | 'createdAt' | 'status'>;
type AppContextType = {
  data: AppData; ready: boolean; toast: string | null; cloudMode: boolean; syncStatus: 'local' | 'loading' | 'synced' | 'saving' | 'error'; syncError: string | null;
  retrySync: () => void; importLocalDemo: () => boolean;
  acceptServerWorkspace: (next: AppData) => void;
  addAnnouncement: (a: AddAnnouncementInput) => void;
  importTelegramAnnouncements: (items: AddAnnouncementInput[]) => number;
  recordPublication: (announcementTitle: string, destinationTitle: string, mode: Method) => void;
  updateAnnouncement: (id: string, fields: Partial<Pick<Announcement, 'title' | 'category' | 'body' | 'sourceUrl' | 'imageUrls' | 'tags'>>) => void;
  removeAnnouncement: (id: string) => void;
  addDestination: (d: AddDestinationInput) => void;
  updateDestination: (id: string, d: AddDestinationInput) => void;
  removeDestination: (id: string) => void;
  addCampaign: (c: AddCampaignInput) => void;
  updateCampaign: (id: string, c: AddCampaignInput) => void;
  removeCampaign: (id: string) => void;
  toggleCampaign: (id: string) => void;
  resetDemo: () => void;
  notify: (text: string) => void;
};

const STORAGE_KEY = 'nashra_demo_v1';
const now = () => new Date().toISOString();
export const newId = () => globalThis.crypto?.randomUUID?.() ?? `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function dateAfter(days: number, hour: number) {
  const dt = new Date(); dt.setDate(dt.getDate() + days); dt.setHours(hour, 0, 0, 0);
  return dt.toISOString();
}

function demoData(): AppData {
  const t = now();
  return {
    announcements: [
      { id: 'a1', title: 'Appartement meublé — Quba', category: 'Immobilier', body: 'Appartement meublé à Quba, Médine. 2 chambres, salon, cuisine équipée, climatisation. Disponible à la location mensuelle.', sourceUrl: '', createdAt: t },
      { id: 'a2', title: 'Studio à Al-Khalidiyyah', category: 'Immobilier', body: 'Studio à louer dans le quartier Al-Khalidiyyah à Médine. Pour plus de renseignements, contactez-nous.', sourceUrl: '', createdAt: t },
      { id: 'a3', title: 'Création de sites web', category: 'Services', body: 'Sites vitrines modernes et multilingues pour commerces, cabinets et agences. Devis personnalisé.', sourceUrl: '', createdAt: t },
      { id: 'a4', title: 'Local commercial — Médine', category: 'Immobilier', body: 'Local commercial disponible. Photos et détails sur demande.', sourceUrl: '', createdAt: t },
      { id: 'a5', title: 'Site vitrine pour restaurant', category: 'Services', body: 'Valorisez votre restaurant avec un site rapide, élégant et compatible mobile.', sourceUrl: '', createdAt: t },
    ],
    destinations: [
      { id: 'g1', name: 'Immobilier — Groupe exemple', handle: '@groupe_exemple_1', category: 'Immobilier', authorized: true, createdAt: t },
      { id: 'g2', name: 'Annonces — Groupe exemple', handle: '@groupe_exemple_2', category: 'Général', authorized: true, createdAt: t },
      { id: 'g3', name: 'Services — Groupe exemple', handle: '@groupe_exemple_3', category: 'Services', authorized: false, createdAt: t },
      { id: 'g4', name: 'Commerce — Groupe exemple', handle: '@groupe_exemple_4', category: 'Commerce', authorized: true, createdAt: t },
    ],
    campaigns: [
      { id: 'c1', name: 'Appartements · matin', announcementId: 'a1', destinationIds: ['g1','g2'], method: 'forward', scheduledAt: dateAfter(1, 10), status: 'scheduled', createdAt: t },
      { id: 'c2', name: 'Services · semaine', announcementId: 'a3', destinationIds: ['g2','g4'], method: 'repost', scheduledAt: dateAfter(2, 14), status: 'scheduled', createdAt: t },
      { id: 'c3', name: 'Studio Khalidiyyah', announcementId: 'a2', destinationIds: ['g1'], method: 'forward', scheduledAt: dateAfter(3, 18), status: 'paused', createdAt: t },
    ],
    activity: [
      { id: 'l1', title: 'Bienvenue sur Nashra', detail: 'Votre espace de démonstration est prêt.', createdAt: t },
    ],
  };
}
const empty: AppData = { announcements: [], destinations: [], campaigns: [], activity: [] };
const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const [data, setData] = useState<AppData>(empty);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'local' | 'loading' | 'synced' | 'saving' | 'error'>(userId ? 'loading' : 'local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const lastSavedRef = useRef('');
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const saveNumber = useRef(0);

  useEffect(() => {
    let live = true;
    setReady(false);
    setLoadError(null);
    if (!userId) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        setData(raw ? JSON.parse(raw) as AppData : demoData());
      } catch { setData(demoData()); }
      setSyncStatus('local');
      setReady(true);
      return;
    }
    const load = async () => {
      try {
        const supabase = createSupabaseClient();
        const { data: row, error } = await supabase.from('workspaces').select('data').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!live) return;
        // Les nouveaux comptes démarrent vides. Aucune donnée de démonstration n'est envoyée sans consentement.
        const initial = (row?.data ?? empty) as AppData;
        if (!initial || !Array.isArray(initial.announcements) || !Array.isArray(initial.destinations) || !Array.isArray(initial.campaigns) || !Array.isArray(initial.activity)) {
          throw new Error('Format de données cloud inattendu.');
        }
        lastSavedRef.current = JSON.stringify(initial);
        setData(initial);
        setSyncStatus('synced');
        setReady(true);
      } catch (error) {
        if (!live) return;
        setLoadError(error instanceof Error ? error.message : 'Connexion aux données impossible.');
        setSyncStatus('error');
      }
    };
    void load();
    return () => { live = false; };
  }, [userId, loadAttempt]);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return;
    }
    const serialized = JSON.stringify(data);
    if (serialized === lastSavedRef.current && syncAttempt === 0) return;
    setSyncStatus('saving');
    const timer = setTimeout(() => {
      const index = ++saveNumber.current;
      writeQueue.current = writeQueue.current.then(async () => {
        const supabase = createSupabaseClient();
        const { error } = await supabase.from('workspaces').upsert({ user_id: userId, data }, { onConflict: 'user_id' });
        if (error) throw error;
        lastSavedRef.current = serialized;
        if (index === saveNumber.current) { setSyncStatus('synced'); setSyncError(null); }
      }).catch(error => {
        if (index === saveNumber.current) {
          setSyncStatus('error');
          const detail = error instanceof Error ? error.message : 'Sauvegarde cloud impossible.';
          setSyncError(detail.includes('NASHRA_ACTIVE_GROUP_QUOTA_EXCEEDED')
            ? 'Limite de groupes actifs atteinte : consultez /abonnement. La modification n’a pas été enregistrée.' : detail);
        }
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [ready, userId, data, syncAttempt]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Calendar endpoints persist first, then return the authoritative workspace.
  // Mark it as saved BEFORE setting React state so the debounced autosave does
  // not race and overwrite the freshly scheduled campaign.
  function acceptServerWorkspace(next: AppData) {
    lastSavedRef.current = JSON.stringify(next);
    setData(next);
    setSyncError(null);
    setSyncStatus(userId ? 'synced' : 'local');
  }
  function notify(message: string) { setToast(message); }
  function update(action: (previous: AppData) => AppData) { setData(action); }
  const log = (title: string, detail: string): Activity => ({ id: newId(), title, detail, createdAt: now() });
  function addAnnouncement(a: AddAnnouncementInput) {
    update(s => ({ ...s, announcements: [{ ...a, id: newId(), createdAt: now() }, ...s.announcements], activity: [log('Annonce ajoutée', a.title), ...s.activity] }));
    notify('Annonce ajoutée à la bibliothèque.');
  }
  function importTelegramAnnouncements(items: AddAnnouncementInput[]) {
    const known = new Set(data.announcements.map(a => `${a.sourceChatId}:${a.sourceMessageId}`));
    const fresh = items.filter(a => a.sourceChatId && a.sourceMessageId && !known.has(`${a.sourceChatId}:${a.sourceMessageId}`));
    if (fresh.length) {
      update(s => ({ ...s, announcements: [...fresh.map(a => ({ ...a, id: newId(), createdAt: now() })), ...s.announcements], activity: [log('Import Telegram', `${fresh.length} message(s) importé(s) depuis le compte personnel.`), ...s.activity] }));
    }
    return fresh.length;
  }
  function recordPublication(announcementTitle: string, destinationTitle: string, mode: Method) {
    update(s => ({ ...s, activity: [log('Publication Telegram effectuée', `${announcementTitle} → ${destinationTitle} · ${mode === 'forward' ? 'transfert' : 'republication'}`), ...s.activity] }));
  }
  function updateAnnouncement(id: string, fields: Partial<Pick<Announcement, 'title' | 'category' | 'body' | 'sourceUrl' | 'imageUrls' | 'tags'>>) {
    update(s => ({ ...s,
      announcements: s.announcements.map(a => a.id === id ? { ...a, ...fields, updatedAt: now() } : a),
      activity: [log('Annonce modifiée', fields.title || s.announcements.find(a => a.id === id)?.title || 'Annonce'), ...s.activity],
    }));
    notify('Annonce mise à jour.');
  }
  function removeAnnouncement(id: string) {
    update(s => ({
      ...s,
      announcements: s.announcements.filter(a => a.id !== id),
      campaigns: s.campaigns.flatMap(c => {
        const remaining = (c.announcementIds?.length ? c.announcementIds : [c.announcementId]).filter(a => a !== id);
        return remaining.length ? [{ ...c, announcementId: remaining[0], announcementIds: remaining }] : [];
      }),
      activity: [log('Annonce supprimée', 'Annonce retirée des campagnes ; les campagnes vides sont supprimées.'), ...s.activity],
    }));
    notify('Annonce supprimée.');
  }
  function addDestination(d: AddDestinationInput) {
    update(s => ({ ...s, destinations: [{ ...d, id: newId(), createdAt: now() }, ...s.destinations], activity: [log('Destination ajoutée', d.name), ...s.activity] }));
    notify('Destination ajoutée.');
  }
  function updateDestination(id: string, d: AddDestinationInput) {
    update(s => ({ ...s,
      destinations: s.destinations.map(item => item.id === id ? { ...item, ...d } : item),
      activity: [log('Destination modifiée', d.name), ...s.activity],
    }));
    notify('Destination mise à jour.');
  }
  function removeDestination(id: string) {
    update(s => ({ ...s, destinations: s.destinations.filter(d => d.id !== id), campaigns: s.campaigns.map(c => ({ ...c, destinationIds: c.destinationIds.filter(g => g !== id) })), activity: [log('Destination supprimée', 'Retirée des campagnes existantes.'), ...s.activity] }));
    notify('Destination supprimée.');
  }
  function addCampaign(c: AddCampaignInput) {
    update(s => ({ ...s, campaigns: [{ ...c, id: newId(), status: 'scheduled', createdAt: now() }, ...s.campaigns], activity: [log('Campagne créée', c.name + ' · planification enregistrée localement.'), ...s.activity] }));
    notify('Campagne enregistrée (simulation uniquement).');
  }
  function updateCampaign(id: string, c: AddCampaignInput) {
    update(s => ({ ...s,
      campaigns: s.campaigns.map(item => item.id === id ? { ...item, ...c } : item),
      activity: [log('Campagne modifiée', c.name + ' · préparation actualisée.'), ...s.activity],
    }));
    notify('Campagne modifiée et sauvegardée. Aucun envoi automatique.');
  }
  function removeCampaign(id: string) {
    update(s => ({ ...s, campaigns: s.campaigns.filter(c => c.id !== id), activity: [log('Campagne supprimée', 'La planification a été retirée.'), ...s.activity] }));
    notify('Campagne supprimée.');
  }
  function toggleCampaign(id: string) {
    update(s => ({ ...s, campaigns: s.campaigns.map(c => c.id === id ? { ...c, status: c.status === 'paused' ? 'scheduled' : 'paused' } : c), activity: [log('Statut de campagne modifié', 'Changement enregistré dans la démonstration.'), ...s.activity] }));
    notify('Statut mis à jour.');
  }
  function resetDemo() {
    setData(userId ? empty : demoData());
    notify(userId ? 'Votre espace a été vidé. Sauvegarde cloud en cours.' : 'Données de démonstration réinitialisées.');
  }
  function retrySync() { setSyncAttempt(v => v + 1); }
  function importLocalDemo() {
    if (!userId) return false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { notify('Aucune ancienne donnée locale trouvée.'); return false; }
      const imported = JSON.parse(raw) as AppData;
      if (!Array.isArray(imported.announcements) || !Array.isArray(imported.destinations) || !Array.isArray(imported.campaigns) || !Array.isArray(imported.activity)) throw new Error('Données locales invalides.');
      setData(imported);
      notify('Anciennes données importées. Synchronisation cloud en cours.');
      return true;
    } catch { notify('Impossible de lire les anciennes données locales.'); return false; }
  }

  if (loadError) return <div className="cloud-error-screen"><div><strong>Impossible d’ouvrir votre espace Nashra</strong><p>{loadError}</p><p>Vérifiez les clés Supabase, l’exécution du script SQL et votre connexion réseau.</p><button onClick={() => setLoadAttempt(x => x + 1)} className="btn btn-primary">Réessayer</button></div></div>;
  return <AppContext.Provider value={{ data, ready, toast, cloudMode: Boolean(userId), syncStatus, syncError, retrySync, importLocalDemo, acceptServerWorkspace, addAnnouncement, updateAnnouncement, importTelegramAnnouncements, recordPublication, removeAnnouncement, addDestination, updateDestination, removeDestination, addCampaign, updateCampaign, removeCampaign, toggleCampaign, resetDemo, notify }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
export function dateFR(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString(localeForIntl(isLocale(typeof document !== 'undefined' ? document.documentElement.lang : null) ? document.documentElement.lang as import('@/lib/i18n').Locale : 'fr'), options ?? { day: 'numeric', month: 'short', year: 'numeric' });
}
export function timeFR(value: string) { return new Date(value).toLocaleTimeString(localeForIntl(isLocale(typeof document !== 'undefined' ? document.documentElement.lang : null) ? document.documentElement.lang as import('@/lib/i18n').Locale : 'fr'), { hour: '2-digit', minute: '2-digit' }); }
