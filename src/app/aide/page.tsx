import Link from 'next/link';
import type { Metadata } from 'next';
import './aide.css';

export const metadata: Metadata = {
  title: 'Centre d’aide | Nashra',
  description: 'Réponses aux questions fréquentes sur les comptes, Telegram, les programmations et les abonnements Nashra.',
};

const sections = [
  {
    id: 'compte', title: 'Compte et connexion', questions: [
      { q: 'Je n’ai pas reçu mon email de confirmation.', a: 'Vérifiez le dossier spam, puis réessayez depuis la page de connexion. Utilisez l’adresse email de votre compte Nashra.' },
      { q: 'J’ai oublié mon mot de passe.', a: 'Depuis la page Connexion, sélectionnez « Mot de passe oublié », puis utilisez le dernier email reçu. Ne transférez jamais ce lien à un tiers.' },
    ],
  },
  {
    id: 'telegram', title: 'Telegram et confidentialité', questions: [
      { q: 'Faut-il un bot Telegram ?', a: 'Non. Nashra se connecte à votre compte Telegram personnel. Utilisez uniquement les groupes dans lesquels vous êtes autorisé à publier.' },
      { q: 'Le compte ne se connecte plus.', a: 'Ouvrez la page Telegram dans votre espace Nashra et vérifiez l’état de la connexion. Ne partagez ni code de connexion ni mot de passe Telegram avec le support.' },
      { q: 'Puis-je publier automatiquement partout ?', a: 'Non. Les droits des groupes, les limites Telegram et les protections anti-doublons restent applicables. Une publication peut nécessiter une vérification manuelle.' },
    ],
  },
  {
    id: 'programmation', title: 'Programmations et annulations', questions: [
      { q: 'Une programmation apparaît « à vérifier ».', a: 'Nashra ne considère pas une absence de réponse comme une preuve d’envoi ou d’échec. Vérifiez directement dans Telegram avant de décider quoi faire. Ne renvoyez pas une publication incertaine sans contrôle.' },
      { q: 'J’ai annulé une campagne. Les messages déjà planifiés sur Telegram vont-ils partir ?', a: 'Certains messages peuvent avoir été programmés directement auprès de Telegram. Vérifiez également la file de programmation Telegram ; annuler une campagne Nashra ne garantit pas l’annulation de tous les messages externes.' },
    ],
  },
  {
    id: 'abonnement', title: 'Abonnements et facturation', questions: [
      { q: 'Comment changer ou arrêter mon abonnement ?', a: 'Connectez-vous à Nashra, ouvrez Abonnement puis utilisez l’accès à la gestion de la facturation Stripe si disponible.' },
      { q: 'Quels sont les quotas ?', a: 'Free : 2 groupes, 10 envois/mois, 3 programmations. Pro : 30 groupes, 1 000 envois/mois, 150 programmations. Business : 30 groupes, 2 000 envois/mois, 300 programmations. Chaque offre autorise un compte Telegram.' },
      { q: 'Un paiement apparaît mais le forfait ne change pas.', a: 'Ne payez pas une seconde fois immédiatement. Vérifiez votre abonnement puis conservez une preuve de paiement pour votre demande d’assistance.' },
    ],
  },
];

export default function HelpPage() {
  const configured = process.env.NEXT_PUBLIC_NASHRA_SUPPORT_EMAIL?.trim() || '';
  const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured) ? configured : null;
  return <main className="nh-root">
    <div className="nh-wrap">
      <header className="nh-header"><Link className="nh-brand" href="/">nashra<span>.</span></Link><Link className="nh-back" href="/connexion">Connexion</Link></header>
      <div className="nh-intro"><span className="nh-kicker">ASSISTANCE NASHRA</span><h1>Comment pouvons-nous vous aider ?</h1><p>Des réponses simples pour gérer votre compte, vos groupes et vos publications Telegram.</p></div>
      <nav className="nh-nav" aria-label="Rubriques d’aide">{sections.map(s => <a href={`#${s.id}`} key={s.id}>{s.title}</a>)}</nav>
      {sections.map(s => <section className="nh-section" id={s.id} key={s.id}><h2>{s.title}</h2>{s.questions.map(item => <details className="nh-question" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</section>)}
      <section className="nh-contact"><h2>Besoin d’aide supplémentaire ?</h2>
        {supportEmail ? <><p>Décrivez le problème, la page concernée et l’heure approximative. Ne transmettez jamais de code Telegram, mot de passe ou clé API.</p><a className="nh-button" href={`mailto:${supportEmail}?subject=${encodeURIComponent('Assistance Nashra')}`}>Contacter l’assistance</a></> : <p>L’adresse d’assistance n’est pas encore configurée. Vous pouvez consulter les rubriques ci-dessus depuis votre espace Nashra.</p>}
      </section>
      <footer className="nh-footer"><Link href="/">Accueil</Link><Link href="/connexion">Mon compte</Link><span>Nashra n’est pas affilié à Telegram.</span></footer>
    </div>
  </main>;
}
