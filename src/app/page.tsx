import type { Metadata } from 'next';
import LandingClient from './landing-client';

export const metadata: Metadata = {
  title: 'Programmer des messages Telegram depuis son compte personnel',
  description: 'Programmez vos messages Telegram depuis votre compte personnel avec Nashra. Gérez vos groupes autorisés et vos campagnes de publication récurrentes.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: 'https://www.usenashra.com/',
    siteName: 'Nashra',
    locale: 'fr_FR',
    title: 'Nashra — Planifiez vos publications Telegram',
    description: 'Une annonce. Vos groupes Telegram autorisés. Au bon moment.',
  },
  twitter: { card: 'summary', title: 'Nashra — Publications Telegram programmées', description: 'Organisez et programmez vos annonces Telegram depuis un seul espace.' },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Nashra',
  url: 'https://www.usenashra.com/',
  description: 'Application web de préparation et programmation des publications Telegram depuis un compte personnel.',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Offre gratuite disponible avec quotas' },
};

export default function HomePage() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <LandingClient />
  </>;
}
