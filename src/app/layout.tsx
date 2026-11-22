import { I18nProvider } from '@/lib/i18n/provider';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.usenashra.com'),
  applicationName: 'Nashra',
  title: { default: 'Nashra — Planifiez vos publications Telegram', template: '%s | Nashra' },
  description: 'Organisez vos annonces, choisissez vos groupes Telegram autorisés et programmez vos publications depuis votre compte personnel.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><I18nProvider>{children}</I18nProvider></body></html>;
}
