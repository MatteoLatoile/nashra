'use client';

import { useState, type MouseEvent } from 'react';
import { BillingFlowLoader } from '@/components/billing-flow-loader';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronDown,
  Clock3, Cloud, Command, FileText, Globe2, History, Layers3, Menu,
  MessageCircle, Pause, Play, Repeat2, Send, ShieldCheck, Sparkles,
  UsersRound, X, Zap,
} from 'lucide-react';
import './landing.css';

type Cycle = 'month' | 'year';
const downloadUrl = (() => {
  const value = process.env.NEXT_PUBLIC_NASHRA_DOWNLOAD_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
})();

const plans = [
  { id: 'free', name: 'Gratuit', description: 'Pour découvrir Nashra, sans engagement.', monthly: 0, yearly: 0, groups: 3, sends: '30', scheduled: 5, highlighted: false },
  { id: 'pro', name: 'Pro', description: 'Pour publier régulièrement, sans perdre de temps.', monthly: 8, yearly: 80, groups: 30, sends: '1 000', scheduled: 150, highlighted: true },
  { id: 'business', name: 'Business', description: 'Pour gérer un volume de diffusion plus important.', monthly: 19, yearly: 190, groups: 100, sends: '5 000', scheduled: 300, highlighted: false },
] as const;

const questions = [
  { question: 'Ai-je besoin d’un bot Telegram ?', answer: 'Non. Nashra est conçu pour connecter votre compte Telegram personnel. Vous devez être autorisé à publier dans chaque groupe sélectionné.' },
  { question: 'Puis-je programmer une annonce tous les deux jours ?', answer: 'Oui, c’est le principe des campagnes récurrentes : choisissez une annonce, les groupes, un intervalle et une heure. Les envois vers plusieurs groupes sont espacés afin de respecter les limites Telegram.' },
  { question: 'Que compte-t-on comme un envoi ?', answer: 'Un envoi correspond à une annonce publiée dans un groupe. Si vous diffusez la même annonce dans 10 groupes, cela utilise 10 envois sur votre quota mensuel.' },
  { question: 'Puis-je utiliser Nashra gratuitement ?', answer: 'Oui. Le forfait Gratuit permet de connecter un compte Telegram, d’utiliser jusqu’à 3 groupes actifs, d’effectuer 30 envois par mois et d’avoir 5 programmations en attente.' },
  { question: 'Faut-il laisser mon ordinateur allumé ?', answer: 'Une programmation déjà acceptée par Telegram peut être prise en charge par Telegram. Les récurrences sur la durée ont également besoin d’un service de renouvellement côté Nashra. Sa disponibilité dépend de l’hébergement activé.' },
  { question: 'Nashra est-il téléchargeable ?', answer: 'Nashra fonctionne actuellement comme une application web. Le bouton de téléchargement sera actif lorsqu’une version installable aura été publiée. Vous pouvez déjà accéder à la plateforme depuis votre navigateur.' },
];

function DownloadButton({ prominent = false }: { prominent?: boolean }) {
  if (downloadUrl) {
    return <a className={`lp-button ${prominent ? 'lp-button-light' : 'lp-button-outline'}`} href={downloadUrl} target="_blank" rel="noopener noreferrer">Télécharger <ArrowUpRight size={17}/></a>;
  }
  return <span className={`lp-button lp-button-disabled ${prominent ? 'lp-button-disabled-hero' : ''}`} title="Version téléchargeable non encore publiée" aria-label="Télécharger : prochainement disponible">Télécharger <span className="lp-soon">Bientôt</span></span>;
}

function Brand({ footer = false }: { footer?: boolean }) {
  return <Link href="/" className={`lp-brand ${footer ? 'lp-brand-footer' : ''}`} aria-label="Nashra, accueil">
    <span className="lp-brand-icon"><Image src="/nashra-mark.png" alt="" width={32} height={32} priority={!footer}/></span>
    <span>nashra<span className="lp-brand-period">.</span></span>
  </Link>;
}

export default function LandingPage() {
  const [cycle, setCycle] = useState<Cycle>('month');
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);
  function beginOfferNavigation(event: MouseEvent<HTMLAnchorElement>, plan: string) {
    // Conserve le comportement standard des liens : nouveau volet/onglet et clic modifié.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setSelectedOffer(`${plan} · ${cycle === 'year' ? 'Annuel' : 'Mensuel'}`);
  }
  return <div className="lp-root">
    {selectedOffer && <BillingFlowLoader step="selection" offer={selectedOffer} />}
    <div className="lp-glow lp-glow-a" aria-hidden="true"/>
    <div className="lp-glow lp-glow-b" aria-hidden="true"/>

    <header className="lp-header">
      <div className="lp-container lp-nav">
        <Brand />
        <nav className={`lp-nav-links ${menuOpen ? 'lp-nav-open' : ''}`} aria-label="Navigation du site">
          <a href="#fonctionnalites" onClick={() => setMenuOpen(false)}>Fonctionnalités</a>
          <a href="#fonctionnement" onClick={() => setMenuOpen(false)}>Comment ça marche</a>
          <a href="#tarifs" onClick={() => setMenuOpen(false)}>Tarifs</a>
          <a href="#questions" onClick={() => setMenuOpen(false)}>Questions</a>
        </nav>
        <div className="lp-nav-actions">
          <Link className="lp-signin" href="/connexion">Connexion</Link>
          <Link className="lp-button lp-button-top" href="/connexion">Commencer <ArrowUpRight size={16}/></Link>
        </div>
        <button className="lp-menu-toggle" onClick={() => setMenuOpen(x => !x)} aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button>
      </div>
    </header>

    <main>
      <section className="lp-hero lp-container" aria-labelledby="lp-main-title">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow"><span className="lp-status-dot"/> VOTRE NOUVEL ESPACE DE DIFFUSION <ArrowUpRight size={13}/></div>
          <h1 id="lp-main-title">Une annonce.<br/><span>Tous vos groupes.</span><br/>Au bon moment.</h1>
          <p className="lp-hero-subtitle">Créez vos annonces, sélectionnez vos groupes Telegram et programmez des diffusions uniques ou récurrentes. Le tout depuis un seul espace.</p>
          <div className="lp-hero-buttons">
            <Link className="lp-button lp-button-light" href="/connexion">Commencer gratuitement <ArrowRight size={19}/></Link>
            <DownloadButton />
          </div>
          <p className="lp-hero-note"><CheckCircle2 size={16}/> Offre gratuite disponible <span>·</span> Sans carte bancaire pour commencer</p>
          <div className="lp-hero-counts" aria-label="Fonctionnalités du produit">
            <div><span className="lp-count-icon"><Repeat2 size={17}/></span><strong>Récurrence</strong><small>Sans ressaisie</small></div>
            <div><span className="lp-count-icon"><UsersRound size={17}/></span><strong>Multi-groupes</strong><small>En un seul flux</small></div>
            <div><span className="lp-count-icon"><ShieldCheck size={17}/></span><strong>Contrôle</strong><small>Groupes autorisés</small></div>
          </div>
        </div>

        <div className="lp-hero-preview" aria-label="Aperçu illustratif du calendrier Nashra">
          <div className="lp-orbit lp-orbit-one" aria-hidden="true"/><div className="lp-orbit lp-orbit-two" aria-hidden="true"/>
          <div className="lp-preview-window">
            <div className="lp-preview-head"><div className="lp-preview-window-title"><span className="lp-preview-window-mark"><Command size={16}/></span> nashra <span className="lp-preview-window-slash">/</span> Calendrier</div><span className="lp-preview-dots"><i/><i/><i/></span></div>
            <div className="lp-preview-inner">
              <div className="lp-preview-intro"><div><span className="lp-preview-overline">VOTRE PROCHAINE CAMPAGNE</span><h2>Appartement à louer</h2><p>Publication récurrente · 3 groupes sélectionnés</p></div><span className="lp-active"><span/> Active</span></div>
              <div className="lp-preview-grid">
                <div className="lp-preview-info"><CalendarDays size={16}/><span><small>RÉPÉTITION</small><strong>Tous les 2 jours</strong></span></div>
                <div className="lp-preview-info"><Clock3 size={16}/><span><small>HEURE DE DÉPART</small><strong>10:00</strong></span></div>
              </div>
              <div className="lp-preview-list-label"><span>DIFFUSION PROGRESSIVE</span><span>APERÇU</span></div>
              <div className="lp-preview-rows">
                {[
                  { name: 'Immobilier • Médine', at: '10:00', status: 'En premier' },
                  { name: 'Annonces • Communauté', at: '10:01:30', status: 'À suivre' },
                  { name: 'Locations • Groupe', at: '10:03', status: 'À suivre' },
                ].map((group, i) => <div className="lp-preview-row" key={group.name}>
                  <div className="lp-preview-row-icon"><Send size={14}/></div>
                  <div className="lp-preview-row-name"><strong>{group.name}</strong><small>{group.status}</small></div>
                  <time>{group.at}</time><span className={`lp-preview-row-num ${i === 0 ? 'lp-num-active' : ''}`}>{String(i + 1).padStart(2, '0')}</span>
                </div>)}
              </div>
              <div className="lp-preview-bottom"><div><CheckCircle2 size={16}/> Gestion des intervalles entre groupes</div><span><Pause size={12}/> Pause</span></div>
            </div>
          </div>
          <div className="lp-floatcard lp-floatcard-one"><div className="lp-floatcard-icon"><Repeat2 size={18}/></div><div><strong>Automatisation</strong><span>Une configuration, plusieurs diffusions</span></div><Check size={16}/></div>
          <div className="lp-preview-caption"><span/> Illustration de l’expérience Nashra — pas une publication réelle</div>
        </div>
      </section>

      <div className="lp-container"><div className="lp-divider"/></div>
      <section className="lp-strip lp-container" aria-label="Points forts"><span><MessageCircle size={16}/> Compte Telegram personnel</span><span><Layers3 size={16}/> Texte, images et albums</span><span><Repeat2 size={16}/> Envois récurrents</span><span><Globe2 size={16}/> Application multilingue</span></section>
      <div className="lp-container"><div className="lp-divider"/></div>

      <section className="lp-section lp-container" id="fonctionnalites">
        <div className="lp-section-heading"><div><span className="lp-kicker">TOUT AU MÊME ENDROIT</span><h2>Moins de copier-coller.<br/><span>Plus de temps pour vous.</span></h2></div><p>Une expérience pensée pour publier de façon organisée, sans multiplier les manipulations sur Telegram.</p></div>
        <div className="lp-feature-grid">
          <article className="lp-feature lp-feature-large"><div className="lp-feature-icon"><FileText size={23}/></div><div><h3>Vos annonces, bien rangées.</h3><p>Centralisez vos textes, photos et albums. Retrouvez et réutilisez vos annonces sans repartir de zéro.</p></div><div className="lp-feature-visual lp-note-visual" aria-hidden="true"><div><span className="lp-note-bullet"/> Nouvelle annonce <span className="lp-note-tiny">● ● ●</span></div><strong>Appartement lumineux<br/>à Médine</strong><div className="lp-note-lines"><i/><i/><i/></div><span className="lp-note-tags">Photos <b>3</b><span>•</span> Brouillon</span></div></article>
          <article className="lp-feature"><div className="lp-feature-icon"><UsersRound size={23}/></div><h3>Plusieurs groupes, un seul geste.</h3><p>Sélectionnez les groupes où vous êtes autorisé à publier. Nashra prépare chaque destination.</p><div className="lp-feature-foot"><CheckCircle2 size={16}/> Destinations autorisées</div></article>
          <article className="lp-feature"><div className="lp-feature-icon"><Repeat2 size={23}/></div><h3>Une fois ou tous les deux jours.</h3><p>Programmez une seule diffusion ou définissez une fréquence qui s’adapte à votre rythme.</p><div className="lp-feature-foot"><Clock3 size={16}/> Tous les N jours à l’heure choisie</div></article>
          <article className="lp-feature"><div className="lp-feature-icon"><History size={23}/></div><h3>Un historique sans ambiguïté.</h3><p>Visualisez les programmations, les résultats confirmés et les erreurs lorsqu’elles surviennent.</p><div className="lp-feature-foot"><ShieldCheck size={16}/> Aucun faux statut « envoyé »</div></article>
          <article className="lp-feature lp-feature-accent"><div className="lp-feature-icon"><Zap size={23}/></div><h3>Diffuser progressivement.</h3><p>Une campagne démarre à l’heure choisie, puis espace les envois entre groupes pour tenir compte des limites de Telegram.</p><div className="lp-feature-foot"><Send size={16}/> Départ planifié, envois espacés</div></article>
        </div>
      </section>

      <section className="lp-section lp-container lp-process" id="fonctionnement"><div className="lp-section-heading lp-heading-center"><div><span className="lp-kicker">SIMPLE DÈS LE PREMIER JOUR</span><h2>Quatre étapes.<br/><span>Tout est sous contrôle.</span></h2></div><p>Pas de processus compliqué. Vous gardez la main sur le contenu, les destinations et les dates.</p></div>
        <div className="lp-steps">
          {[
            { n: '01', icon: FileText, title: 'Créez une annonce', text: 'Rédigez votre contenu et ajoutez vos médias.' },
            { n: '02', icon: UsersRound, title: 'Choisissez vos groupes', text: 'Sélectionnez les destinations autorisées.' },
            { n: '03', icon: CalendarDays, title: 'Définissez la fréquence', text: 'Une seule fois ou tous les deux jours à 10 h.' },
            { n: '04', icon: History, title: 'Suivez les résultats', text: 'Consultez le calendrier et l’historique.' },
          ].map(({ n, icon: Icon, title, text }) => <div className="lp-step" key={n}><div className="lp-step-top"><span>{n}</span><Icon size={20}/></div><h3>{title}</h3><p>{text}</p></div>)}
        </div>
      </section>

      <section className="lp-section lp-container lp-pricing" id="tarifs">
        <div className="lp-section-heading"><div><span className="lp-kicker">DES TARIFS TRANSPARENTS</span><h2>Commencez gratuitement.<br/><span>Évoluez quand vous voulez.</span></h2></div><div className="lp-cycle" role="group" aria-label="Choisir la fréquence de facturation"><button type="button" className={cycle === 'month' ? 'lp-cycle-active' : ''} onClick={() => setCycle('month')} aria-pressed={cycle === 'month'}>Mensuel</button><button type="button" className={cycle === 'year' ? 'lp-cycle-active' : ''} onClick={() => setCycle('year')} aria-pressed={cycle === 'year'}>Annuel <span>−17 %</span></button></div></div>
        <div className="lp-plan-grid">{plans.map(plan => <article className={`lp-plan ${plan.highlighted ? 'lp-plan-popular' : ''}`} key={plan.id}>
          {plan.highlighted && <span className="lp-popular"><Sparkles size={14}/> NOTRE SUGGESTION</span>}
          <div className="lp-plan-name"><span>{plan.name}</span>{plan.id === 'free' ? <span className="lp-plan-small-badge">POUR ESSAYER</span> : null}</div>
          <p className="lp-plan-description">{plan.description}</p>
          <div className="lp-plan-price"><strong>{cycle === 'month' ? plan.monthly : plan.yearly} $</strong><span>/{cycle === 'month' ? 'mois' : 'an'}</span></div>
          <div className="lp-plan-subprice">{cycle === 'year' && plan.yearly ? `Soit ${(plan.yearly / 12).toFixed(2).replace('.', ',')} $/mois, facturé annuellement` : cycle === 'month' && plan.monthly ? 'Facturation mensuelle' : 'Sans carte bancaire'}</div>
          <Link className={`lp-plan-cta ${plan.highlighted ? 'lp-plan-cta-highlight' : ''}`} onClick={event => { if (plan.id !== 'free') beginOfferNavigation(event, plan.name); }} href={plan.id === 'free' ? '/connexion' : `/connexion?next=${encodeURIComponent(`/abonnement?checkout=${plan.id}&interval=${cycle}`)}`}>{plan.id === 'free' ? 'Commencer gratuitement' : `Découvrir ${plan.name}`} <ArrowRight size={17}/></Link>
          <div className="lp-plan-separator"/><span className="lp-plan-include">CE QUI EST INCLUS</span>
          <ul><li><Check size={16}/> 1 compte Telegram</li><li><Check size={16}/> {plan.groups} groupes actifs</li><li><Check size={16}/> {plan.sends} envois par mois</li><li><Check size={16}/> {plan.scheduled} programmations en attente</li><li><Check size={16}/> Publications uniques et récurrentes</li>{plan.id === 'business' && <li><Check size={16}/> Support prioritaire</li>}</ul>
        </article>)}</div>
        <p className="lp-pricing-notice"><ShieldCheck size={16}/> Tarifs affichés en USD. Les paiements sont traités de manière sécurisée par Stripe. Un envoi = une annonce dans un groupe.</p>
      </section>

      <section className="lp-section lp-container lp-faq" id="questions"><div className="lp-section-heading"><div><span className="lp-kicker">ON VOUS RÉPOND</span><h2>Les bonnes questions.<br/><span>Les réponses simples.</span></h2></div><p>Tout ce qu’il faut savoir pour démarrer dans de bonnes conditions.</p></div><div className="lp-faq-list">{questions.map(({question,answer}, i) => <div className={`lp-faq-item ${faqOpen === i ? 'lp-faq-active' : ''}`} key={question}><button type="button" onClick={() => setFaqOpen(v => v === i ? null : i)} aria-expanded={faqOpen === i} aria-controls={`lp-faq-answer-${i}`}><span>{question}</span><ChevronDown size={19}/></button><div id={`lp-faq-answer-${i}`} hidden={faqOpen !== i}><p>{answer}</p></div></div>)}</div></section>

      <section className="lp-container lp-bottom-cta" id="telecharger"><div className="lp-bottom-decor" aria-hidden="true"><div/><div/><div/></div><div className="lp-bottom-content"><span className="lp-kicker">PRÊT À SIMPLIFIER VOTRE QUOTIDIEN ?</span><h2>Vos annonces méritent<br/>un meilleur rythme<span>.</span></h2><p>Centralisez vos publications Telegram et reprenez le contrôle de votre calendrier.</p><div className="lp-bottom-actions"><Link href="/connexion" className="lp-button lp-button-dark">Ouvrir Nashra gratuitement <ArrowRight size={18}/></Link><DownloadButton prominent/></div></div></section>
    </main>

    <footer className="lp-footer"><div className="lp-container lp-footer-main"><div><Brand footer/><p>Une façon plus simple d’organiser vos annonces et vos publications Telegram.</p></div><nav aria-label="Liens de pied de page"><a href="#fonctionnalites">Fonctionnalités</a><a href="#tarifs">Offres</a><a href="#questions">FAQ</a><Link href="/connexion">Connexion</Link></nav></div><div className="lp-container lp-footer-base"><span>© {new Date().getFullYear()} Nashra. Tous droits réservés.</span><span>Nashra n’est pas affilié à Telegram.</span></div></footer>
  </div>;
}
