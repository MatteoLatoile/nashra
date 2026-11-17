'use client';

import { useEffect, useState } from 'react';
import { LanguageSettingsCard } from '@/components/language-settings';
import Link from 'next/link';
import { Database, HardDrive, LockKeyhole, RotateCcw, ShieldCheck, PlugZap, Globe2, Monitor, Info, Cloud, Download } from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useApp } from '@/lib/store';

type DiagnosticState = 'ok' | 'warning' | 'error' | 'disabled';
type DiagnosticCheck = { key: string; state: DiagnosticState; detail: string };

export default function SettingsPage() {
  const { resetDemo, data, cloudMode, syncStatus, syncError, retrySync, importLocalDemo, notify } = useApp();
  const confirm = useConfirm();
  const [configuration, setConfiguration] = useState<DiagnosticCheck[] | null>(null);

  // Lecture uniquement. Ne pas confondre configuration serveur et envoi réellement réussi.
  useEffect(() => {
    if (!cloudMode) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/diagnostics', {
          credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { checks?: DiagnosticCheck[] };
        if (!abort.signal.aborted && Array.isArray(result.checks)) setConfiguration(result.checks);
      } catch {
        // Le badge reste 'À vérifier' si le diagnostic n'est pas disponible.
      }
    })();
    return () => abort.abort();
  }, [cloudMode]);

  const publishing = configuration?.find(item => item.key === 'publishing');
  const recurring = configuration?.find(item => item.key === 'recurring');
  const publishingLabel = !cloudMode ? 'Mode local' : !publishing ? 'À vérifier'
    : publishing.state === 'disabled' ? 'Désactivées'
    : publishing.state === 'warning' ? 'Configurées · à vérifier' : 'Disponibles';
  const recurringLabel = !cloudMode ? 'Mode local' : !recurring ? 'À vérifier'
    : recurring.state === 'disabled' ? 'Désactivée' : 'Configurée · à vérifier';

  async function importOldDemo() {
    if (await confirm({
      title: 'Importer les données locales ?',
      description: 'Les données actuelles de votre espace cloud seront remplacées par les anciennes données enregistrées dans ce navigateur.',
      item: 'Espace Nashra cloud', itemLabel: 'ESPACE À REMPLACER',
      note: 'Exportez une sauvegarde avant de continuer.',
      confirmText: 'Remplacer mes données', tone: 'warning',
    })) importLocalDemo();
  }

  async function clearWorkspace() {
    const approved = await confirm(cloudMode ? {
      title: 'Vider votre espace cloud ?',
      description: 'Toutes vos annonces, vos destinations, vos campagnes et votre historique Nashra seront définitivement effacés.',
      item: 'Toutes les données de votre espace', itemLabel: 'SUPPRESSION DÉFINITIVE',
      note: 'Cette action ne peut pas être annulée. Exportez vos données avant de poursuivre.',
      requireText: 'VIDER', confirmText: 'Vider mon espace', tone: 'danger',
    } : {
      title: 'Réinitialiser les données locales ?',
      description: 'Vos modifications locales seront remplacées par les données initiales.',
      item: 'Données locales', confirmText: 'Réinitialiser', tone: 'warning',
    });
    if (approved) {
      resetDemo();
      notify(cloudMode ? 'Espace réinitialisé.' : 'Données locales réinitialisées.');
    }
  }

  function downloadBackup() {
    const content = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(content);
    link.href = url;
    link.download = 'nashra-sauvegarde.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return <>
    <PageHeader eyebrow="CONFIGURATION" title="Paramètres"
      description="Gérez votre espace, votre compte Telegram et les options de publication." />
    <div className="setting-tip"><Info size={17}/> Besoin d’aide pour la connexion, les programmations ou les abonnements ? <Link href="/aide" className="text-link">Consulter le centre d’aide →</Link></div>
    <LanguageSettingsCard />
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-heading">
          <span className="settings-icon"><PlugZap size={21}/></span>
          <div><h2>Connexion Telegram</h2><p>Canaux, groupes et publications</p></div>
          <Badge tone="positive">Compte personnel</Badge>
        </div>
        <div className="setting-split">
          <span>Telegram MTProto (compte personnel)</span>
          <Link href="/telegram" className="text-link">Configurer →</Link>
        </div>
        <div className="setting-split">
          <span>Publications automatiques</span>
          <Badge tone={publishing?.state === 'ok' ? 'positive' : 'neutral'}>{publishingLabel}</Badge>
        </div>
        <div className="setting-split">
          <span>Programmations récurrentes</span>
          <Badge tone={recurring?.state === 'ok' ? 'positive' : 'neutral'}>{recurringLabel}</Badge>
        </div>
        <div className="setting-split">
          <span>Transfert et publication manuels</span>
          <Link href="/annonces" className="text-link">Ouvrir les annonces →</Link>
        </div>
        <div className="setting-tip"><ShieldCheck size={17}/>
          Les fonctionnalités sont intégrées ; leur fonctionnement réel dépend des droits Telegram,
          de votre configuration serveur et de l’exécution des tâches programmées.
          {' '}<Link href="/diagnostics" className="text-link">Voir le diagnostic →</Link>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-heading">
          <span className="settings-icon"><Database size={21}/></span>
          <div><h2>Vos données</h2><p>Stockage et sauvegarde</p></div>
        </div>
        <div className="setting-split"><span><HardDrive size={16}/> Stockage</span>
          <strong>{cloudMode ? 'Supabase · privé' : 'Navigateur · local'}</strong></div>
        <div className="setting-split"><span><LockKeyhole size={16}/> Synchronisation</span>
          <Badge tone={syncStatus === 'synced' ? 'positive' : 'neutral'}>
            {syncStatus === 'synced' ? 'Synchronisé' : syncStatus === 'error' ? 'Erreur'
              : cloudMode ? 'En cours' : 'Local'}
          </Badge>
        </div>
        <p className="settings-explain">
          {cloudMode
            ? 'Vos annonces, destinations et campagnes sont sauvegardées dans votre espace Supabase protégé par les règles d’accès.'
            : 'Vos données restent dans ce navigateur tant que l’espace Supabase n’est pas actif.'}
        </p>
        {syncError && <div className="tg-feedback tg-feedback-error"><Info size={16}/>
          {syncError} <button type="button" className="text-link" onClick={retrySync}>Réessayer</button>
        </div>}
        <div className="setting-actions">
          <button type="button" onClick={downloadBackup} className="btn btn-secondary reset-btn">
            <Download size={16}/> Exporter mes données
          </button>
          {cloudMode && <button type="button" onClick={() => void importOldDemo()} className="btn btn-secondary reset-btn">
            <Cloud size={16}/> Importer les données locales
          </button>}
          <button type="button" onClick={() => void clearWorkspace()} className="btn btn-secondary reset-btn">
            <RotateCcw size={16}/> {cloudMode ? 'Vider mon espace' : 'Réinitialiser les données locales'}
          </button>
        </div>
      </section>
      <section className="settings-card settings-wide">
        <div className="settings-heading">
          <span className="settings-icon"><Globe2 size={21}/></span>
          <div><h2>Avancement du produit</h2><p>Fonctions intégrées et étapes de validation</p></div>
        </div>
        <div className="roadmap">
          <div><span className="roadmap-step roadmap-now">01</span>
            <strong>Plateforme web</strong><small>Interface et gestion des annonces</small>
            <Badge tone="positive">Intégrée</Badge></div>
          <div><span className="roadmap-step">02</span>
            <strong>Comptes et abonnements</strong><small>Supabase et paiement Stripe</small>
            <Badge tone="positive">Intégrés</Badge></div>
          <div><span className="roadmap-step">03</span>
            <strong>Publication et programmation</strong>
            <small>Envoi manuel, file d’attente et récurrence</small>
            <Badge>Tests de production requis</Badge></div>
          <div><span className="roadmap-step">04</span>
            <strong>Application Windows</strong><small>Déclinaison bureau après validation du SaaS</small>
            <Badge>Prévue</Badge></div>
        </div>
      </section>
    </div>
    <div className="settings-bottom"><Monitor size={17}/> Nashra · Application web
      <span>·</span><Info size={17}/> Publication et récurrence soumises aux contrôles de sécurité.
    </div>
  </>;
}
