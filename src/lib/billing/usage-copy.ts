import type { Locale } from '@/lib/i18n';

export type UsageKey = 'accounts' | 'groups' | 'sends' | 'pending' | 'near' | 'reached' | 'upgrade' | 'month' | 'priority';
const words: Record<Locale, Record<UsageKey,string>> = {
  fr: { accounts:'Comptes Telegram',groups:'Groupes actifs',sends:'Envois réservés ce mois-ci',pending:'Programmations en attente',near:'Vous approchez de la limite du forfait.',reached:'Limite du forfait atteinte.',upgrade:'Voir les abonnements',month:'mois',priority:'Support prioritaire' },
  en: { accounts:'Telegram accounts',groups:'Active groups',sends:'Sends allocated this month',pending:'Pending schedules',near:'You are close to your plan limit.',reached:'Plan limit reached.',upgrade:'View plans',month:'month',priority:'Priority support' },
  ar: { accounts:'حسابات تيليجرام',groups:'المجموعات النشطة',sends:'الإرسالات المحجوزة هذا الشهر',pending:'المنشورات المجدولة المعلقة',near:'أنت تقترب من حد باقتك.',reached:'وصلت إلى حد باقتك.',upgrade:'عرض الاشتراكات',month:'شهر',priority:'دعم ذو أولوية' },
  ru: { accounts:'Аккаунты Telegram',groups:'Активные группы',sends:'Запланированные отправки за месяц',pending:'Ожидающие публикации',near:'Вы близки к лимиту тарифа.',reached:'Лимит тарифа достигнут.',upgrade:'Посмотреть тарифы',month:'месяц',priority:'Приоритетная поддержка' },
  es: { accounts:'Cuentas de Telegram',groups:'Grupos activos',sends:'Envíos reservados este mes',pending:'Programaciones pendientes',near:'Te acercas al límite de tu plan.',reached:'Límite del plan alcanzado.',upgrade:'Ver planes',month:'mes',priority:'Soporte prioritario' },
  it: { accounts:'Account Telegram',groups:'Gruppi attivi',sends:'Invii prenotati questo mese',pending:'Programmazioni in attesa',near:'Sei vicino al limite del piano.',reached:'Limite del piano raggiunto.',upgrade:'Visualizza piani',month:'mese',priority:'Supporto prioritario' },
  de: { accounts:'Telegram-Konten',groups:'Aktive Gruppen',sends:'Reservierte Sendungen diesen Monat',pending:'Ausstehende Zeitpläne',near:'Du näherst dich deinem Tariflimit.',reached:'Tariflimit erreicht.',upgrade:'Tarife anzeigen',month:'Monat',priority:'Bevorzugter Support' },
  id: { accounts:'Akun Telegram',groups:'Grup aktif',sends:'Pengiriman dialokasikan bulan ini',pending:'Jadwal tertunda',near:'Anda mendekati batas paket.',reached:'Batas paket tercapai.',upgrade:'Lihat paket',month:'bulan',priority:'Dukungan prioritas' },
  fil: { accounts:'Mga Telegram account',groups:'Mga aktibong grupo',sends:'Mga nakareserbang padala ngayong buwan',pending:'Mga nakabinbing iskedyul',near:'Malapit ka na sa limitasyon ng plano.',reached:'Naabot na ang limitasyon ng plano.',upgrade:'Tingnan ang mga plano',month:'buwan',priority:'Prayoridad na suporta' },
  tr: { accounts:'Telegram hesapları',groups:'Etkin gruplar',sends:'Bu ay ayrılan gönderimler',pending:'Bekleyen zamanlamalar',near:'Paket sınırınıza yaklaşıyorsunuz.',reached:'Paket sınırına ulaşıldı.',upgrade:'Paketleri gör',month:'ay',priority:'Öncelikli destek' },
  ur: { accounts:'ٹیلیگرام اکاؤنٹس',groups:'فعال گروپس',sends:'اس ماہ کے مختص پیغامات',pending:'زیرِ التوا شیڈول',near:'آپ اپنے پلان کی حد کے قریب ہیں۔',reached:'پلان کی حد پوری ہو گئی ہے۔',upgrade:'پلان دیکھیں',month:'مہینہ',priority:'ترجیحی مدد' },
};
export function usageCopy(locale: Locale) { return words[locale] || words.fr; }
