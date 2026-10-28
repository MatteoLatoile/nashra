'use client';
import Link from 'next/link';
import { Database, HardDrive, LockKeyhole, RotateCcw, ShieldCheck, PlugZap, Globe2, Monitor, Info, Cloud, Download } from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useApp } from '@/lib/store';
export default function SettingsPage() {
  const { resetDemo, data, cloudMode, syncStatus, syncError, retrySync, importLocalDemo, notify } = useApp();
  const confirm = useConfirm();
  async function importOldDemo() {
    if (await confirm({ title: 'Importer les données locales ?', description: 'Les données actuelles de votre espace cloud seront remplacées par les anciennes données enregistrées dans ce navigateur.', item: 'Espace Nashra cloud', itemLabel: 'ESPACE À REMPLACER', note: 'Exportez une sauvegarde avant de continuer.', confirmText: 'Remplacer mes données', tone: 'warning' })) {
      const done = importLocalDemo();
      if (done) notify('Anciennes données importées.'); else notify('Aucune ancienne démo trouvée.');
    }
  }
  async function clearWorkspace() {
    const approved = await confirm(cloudMode ? {
      title: 'Vider votre espace cloud ?',
      description: 'Toutes vos annonces, vos destinations, vos campagnes et votre historique Nashra seront définitivement effacés.',
      item: 'Toutes les données de votre espace',
      itemLabel: 'SUPPRESSION DÉFINITIVE',
      note: 'Cette action ne peut pas être annulée. Exportez vos données avant de poursuivre.',
      requireText: 'VIDER',
      confirmText: 'Vider mon espace',
      tone: 'danger',
    } : {
      title: 'Réinitialiser la démonstration ?',
      description: 'Vos modifications locales seront remplacées par les données de démonstration initiales.',
      item: 'Démonstration locale',
      confirmText: 'Réinitialiser',
      tone: 'warning',
    });
    if (approved) { resetDemo(); notify(cloudMode ? 'Espace réinitialisé.' : 'Démonstration réinitialisée.'); }
  }
  function downloadBackup() {
    const content = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(content); link.download = 'nashra-sauvegarde.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
  return <><PageHeader eyebrow="CONFIGURATION" title="Paramètres" description="Gérez les préférences de votre espace et découvrez les prochaines intégrations."/>
    <div className="settings-grid"><section className="settings-card"><div className="settings-heading"><span className="settings-icon"><PlugZap size={21}/></span><div><h2>Connexion Telegram</h2><p>Canaux, groupes et publications</p></div><Badge tone="positive">Compte personnel</Badge></div><div className="setting-split"><span>Telegram MTProto (compte personnel)</span><Link href="/telegram" className="text-link">Configurer →</Link></div><div className="setting-split"><span>Publications automatiques</span><Badge>Désactivées</Badge></div><div className="setting-split"><span>Transfert de messages</span><Badge tone="positive">Compte personnel · manuel</Badge></div><div className="setting-tip"><ShieldCheck size={17}/> Les envois doivent respecter les règles du groupe ou canal destinataire.</div></section>
      <section className="settings-card"><div className="settings-heading"><span className="settings-icon"><Database size={21}/></span><div><h2>Vos données</h2><p>Stockage et réinitialisation</p></div></div><div className="setting-split"><span><HardDrive size={16}/> Stockage</span><strong>{cloudMode ? 'Supabase · privé' : 'Navigateur · démo'}</strong></div><div className="setting-split"><span><LockKeyhole size={16}/> Synchronisation</span><Badge tone={syncStatus === 'synced' ? 'positive' : 'neutral'}>{syncStatus === 'synced' ? 'Synchronisé' : syncStatus === 'error' ? 'Erreur' : cloudMode ? 'En cours' : 'Local'}</Badge></div>
      <p className="settings-explain">{cloudMode ? 'Vos annonces, destinations et campagnes sont sauvegardées dans votre espace Supabase protégé par des politiques RLS.' : 'Cette démonstration sauvegarde seulement dans votre navigateur. Configurez Supabase pour avoir votre propre compte.'}</p>
      {syncError && <div className="tg-feedback tg-feedback-error"><Info size={16}/>{syncError} <button className="text-link" onClick={retrySync}>Réessayer</button></div>}
      <div className="setting-actions"><button onClick={downloadBackup} className="btn btn-secondary reset-btn"><Download size={16}/> Exporter mes données</button>
      {cloudMode && <button onClick={() => void importOldDemo()} className="btn btn-secondary reset-btn"><Cloud size={16}/> Importer l’ancienne démo</button>}
      <button onClick={() => void clearWorkspace()} className="btn btn-secondary reset-btn"><RotateCcw size={16}/> {cloudMode ? 'Vider mon espace' : 'Réinitialiser la démo'}</button></div></section>
      <section className="settings-card settings-wide"><div className="settings-heading"><span className="settings-icon"><Globe2 size={21}/></span><div><h2>Feuille de route</h2><p>Ce qui arrive après le prototype</p></div></div><div className="roadmap"><div><span className="roadmap-step roadmap-now">01</span><strong>Prototype local</strong><small>Interface et gestion des contenus</small><Badge tone="positive">En cours</Badge></div><div><span className="roadmap-step">02</span><strong>Comptes utilisateurs</strong><small>Authentification et base Supabase</small><Badge tone="positive">Intégré</Badge></div><div><span className="roadmap-step">03</span><strong>Publication autorisée</strong><small>Compte personnel en test ; planification à venir</small><Badge>À venir</Badge></div><div><span className="roadmap-step">04</span><strong>Application Windows</strong><small>Tauri + mêmes données SaaS</small><Badge>À venir</Badge></div></div></section></div>
    <div className="settings-bottom"><Monitor size={17}/> Nashra v0.7.0 <span>·</span><Info size={17}/> Campagnes multi-annonces et dates récurrentes ; aucune publication automatisée.</div>
  </>;
}
