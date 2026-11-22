/** International Telegram phone input. No external network or phone-number library. */
export const PHONE_COUNTRIES = [
  { iso: 'FR', flag: '🇫🇷', name: 'France', dial: '+33', example: '6 12 34 56 78' },
  { iso: 'SA', flag: '🇸🇦', name: 'Arabie saoudite', dial: '+966', example: '50 123 4567' },
  { iso: 'BE', flag: '🇧🇪', name: 'Belgique', dial: '+32', example: '470 12 34 56' },
  { iso: 'CH', flag: '🇨🇭', name: 'Suisse', dial: '+41', example: '79 123 45 67' },
  { iso: 'MA', flag: '🇲🇦', name: 'Maroc', dial: '+212', example: '6 12 34 56 78' },
  { iso: 'DZ', flag: '🇩🇿', name: 'Algérie', dial: '+213', example: '5 50 12 34 56' },
  { iso: 'TN', flag: '🇹🇳', name: 'Tunisie', dial: '+216', example: '20 123 456' },
  { iso: 'EG', flag: '🇪🇬', name: 'Égypte', dial: '+20', example: '10 1234 5678' },
  { iso: 'AE', flag: '🇦🇪', name: 'Émirats arabes unis', dial: '+971', example: '50 123 4567' },
  { iso: 'KW', flag: '🇰🇼', name: 'Koweït', dial: '+965', example: '500 12345' },
  { iso: 'QA', flag: '🇶🇦', name: 'Qatar', dial: '+974', example: '5000 1234' },
  { iso: 'BH', flag: '🇧🇭', name: 'Bahreïn', dial: '+973', example: '3600 1234' },
  { iso: 'OM', flag: '🇴🇲', name: 'Oman', dial: '+968', example: '9000 1234' },
  { iso: 'JO', flag: '🇯🇴', name: 'Jordanie', dial: '+962', example: '7 9012 3456' },
  { iso: 'TR', flag: '🇹🇷', name: 'Turquie', dial: '+90', example: '532 123 45 67' },
  { iso: 'GB', flag: '🇬🇧', name: 'Royaume-Uni', dial: '+44', example: '7700 900123' },
  { iso: 'US', flag: '🇺🇸', name: 'États-Unis', dial: '+1', example: '202 555 0147' },
  { iso: 'CA', flag: '🇨🇦', name: 'Canada', dial: '+1', example: '416 555 0147' },
  { iso: 'ES', flag: '🇪🇸', name: 'Espagne', dial: '+34', example: '612 345 678' },
  { iso: 'IT', flag: '🇮🇹', name: 'Italie', dial: '+39', example: '312 345 6789' },
  { iso: 'DE', flag: '🇩🇪', name: 'Allemagne', dial: '+49', example: '151 23456789' },
  { iso: 'NL', flag: '🇳🇱', name: 'Pays-Bas', dial: '+31', example: '6 12345678' },
  { iso: 'RU', flag: '🇷🇺', name: 'Russie', dial: '+7', example: '912 345 67 89' },
  { iso: 'SN', flag: '🇸🇳', name: 'Sénégal', dial: '+221', example: '77 123 45 67' },
  { iso: 'CI', flag: '🇨🇮', name: 'Côte d’Ivoire', dial: '+225', example: '07 12 34 56 78' },
  { iso: 'PK', flag: '🇵🇰', name: 'Pakistan', dial: '+92', example: '300 1234567' },
  { iso: 'IN', flag: '🇮🇳', name: 'Inde', dial: '+91', example: '98765 43210' },
  { iso: 'AO', flag: '🇦🇴', name: 'Angola', dial: '+244', example: '923 123 456' },
] as const;

export function exampleNumber(iso: string): string {
  return PHONE_COUNTRIES.find(country => country.iso === iso)?.example ?? 'Numéro local';
}

export function formatTelegramNumber(iso: string, local: string): string | null {
  const country = PHONE_COUNTRIES.find(item => item.iso === iso);
  if (!country || /[+a-zA-Z]/.test(local)) return null; // avoid duplicated country codes
  let digits = local.replace(/[\s().-]/g, '');
  if (!/^\d{5,14}$/.test(digits)) return null;
  // Trunk zero is used in local dialing in these countries; not in E.164.
  // Do not strip significant zeros from other countries (e.g. Italy).
  const trunkPrefix = new Set(['FR','SA','BE','CH','MA','DZ','EG','AE','JO','TR','GB','DE','NL','RU','SN','PK']);
  if (trunkPrefix.has(iso) && digits.startsWith('0')) digits = digits.slice(1);
  const result = `${country.dial}${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(result) ? result : null;
}
