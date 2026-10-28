import { I18nProvider } from '@/lib/i18n/provider';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nashra — Votre contenu, au bon endroit',
  description: 'Gérez vos annonces et publications Telegram dans un seul espace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><I18nProvider>{children}</I18nProvider></body></html>;
}
