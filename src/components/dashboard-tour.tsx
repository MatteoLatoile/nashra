'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ChangeEvent as ReactChangeEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Pause, Play, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/provider';
import type { Locale } from '@/lib/i18n';

/**
 * Nashra's walkthrough is deliberately read-only. It may open an EMPTY editor
 * or navigate to a route; it must never submit a form, connect an account,
 * publish to Telegram, remove a destination or change a setting.
 */
type Chapter = 'intro' | 'annonces' | 'telegram' | 'groupes' | 'agenda' | 'historique' | 'compte';
type ModalName = 'announcement' | 'publish' | 'destination' | 'schedule';
type Step = {
  id: string;
  chapter: Chapter;
  path: string;
  selector?: string;
  modal?: ModalName;
  sidebar?: boolean;
};

const STEPS: Step[] = [
  { id: 'welcome', chapter: 'intro', path: '/dashboard' },
  { id: 'home', chapter: 'intro', path: '/dashboard', selector: '.welcome-banner, .page-heading' },
  { id: 'library', chapter: 'annonces', path: '/annonces', selector: '.n12-summary, .n12-library' },
  { id: 'search', chapter: 'annonces', path: '/annonces', selector: '.n12-search, .n12-controls' },
  { id: 'filter', chapter: 'annonces', path: '/annonces', selector: '.n12-filter-row, .n12-view' },
  { id: 'new', chapter: 'annonces', path: '/annonces', selector: '.n12-header-actions button, .heading-actions button' },
  { id: 'identity', chapter: 'annonces', path: '/annonces', modal: 'announcement', selector: '.modal-dialog .n12-editor-row' },
  { id: 'content', chapter: 'annonces', path: '/annonces', modal: 'announcement', selector: '.modal-dialog .n12-editor textarea' },
  { id: 'photos', chapter: 'annonces', path: '/annonces', modal: 'announcement', selector: '.modal-dialog .n20-media-block' },
  { id: 'tags', chapter: 'annonces', path: '/annonces', modal: 'announcement', selector: '.modal-dialog input[placeholder*="Médine"], .modal-dialog .n12-editor .field-label:last-of-type' },
  { id: 'preview', chapter: 'annonces', path: '/annonces', modal: 'announcement', selector: '.modal-dialog .n20-editor-actions' },
  { id: 'manage', chapter: 'annonces', path: '/annonces', selector: '.n12-card-actions, .n12-empty-actions, .n12-grid' },
  { id: 'send', chapter: 'annonces', path: '/annonces', selector: '.n12-card-actions button[title="Publier maintenant"], .n12-card-actions, .n12-header-actions' },
  { id: 'sendconfirm', chapter: 'annonces', path: '/annonces', modal: 'publish', selector: '.modal-dialog select, .n12-card-actions, .n12-header-actions' },
  { id: 'tgstatus', chapter: 'telegram', path: '/telegram', selector: '.tg-hero, .page-heading' },
  { id: 'tglogin', chapter: 'telegram', path: '/telegram', selector: '.tg-connect-card, .tg-form-grid, input[type="tel"]' },
  { id: 'tgdialogs', chapter: 'telegram', path: '/telegram', selector: '.tg-three-steps, .tg-action-card' },
  { id: 'tgimport', chapter: 'telegram', path: '/telegram', selector: '.tg-publisher .tg-form-grid, .tg-publisher' },
  { id: 'tgauthorize', chapter: 'telegram', path: '/telegram', selector: '.tg-publisher .check-field, .tg-publisher' },
  { id: 'groups', chapter: 'groupes', path: '/groupes', selector: '.table-panel, .notice-row' },
  { id: 'groupnew', chapter: 'groupes', path: '/groupes', selector: '.heading-actions button' },
  { id: 'groupid', chapter: 'groupes', path: '/groupes', modal: 'destination', selector: '.modal-dialog input[placeholder*="-100"], .modal-dialog .form-stack' },
  { id: 'groupperm', chapter: 'groupes', path: '/groupes', modal: 'destination', selector: '.modal-dialog .check-field, .modal-dialog .inline-help' },
  { id: 'calendar', chapter: 'agenda', path: '/campagnes', selector: '.n40-calendar, .page-heading' },
  { id: 'calendarnew', chapter: 'agenda', path: '/campagnes', selector: '.heading-actions button' },
  { id: 'calendarad', chapter: 'agenda', path: '/campagnes', modal: 'schedule', selector: '.modal-dialog select, .modal-dialog .form-stack' },
  { id: 'calendarfrequency', chapter: 'agenda', path: '/campagnes', modal: 'schedule', selector: '.modal-dialog [data-tour="schedule-mode"]' },
  { id: 'calendarinterval', chapter: 'agenda', path: '/campagnes', modal: 'schedule', selector: '.modal-dialog [data-tour="schedule-interval"], .modal-dialog [data-tour="schedule-timezone"]' },
  { id: 'calendardate', chapter: 'agenda', path: '/campagnes', modal: 'schedule', selector: '.modal-dialog input[type="datetime-local"]' },
  { id: 'calendargroups', chapter: 'agenda', path: '/campagnes', modal: 'schedule', selector: '.modal-dialog .n40-dest' },
  { id: 'calendarstagger', chapter: 'agenda', path: '/campagnes', modal: 'schedule', selector: '.modal-dialog [data-tour="group-stagger"]' },
  { id: 'calendarconfirm', chapter: 'agenda', path: '/campagnes', modal: 'schedule', selector: '.modal-dialog .modal-actions' },
  { id: 'calendarmanage', chapter: 'agenda', path: '/campagnes', selector: '.n40-side, .n40-item-actions' },
  { id: 'history', chapter: 'historique', path: '/historique', selector: '.n40-history-table, .table-panel, .page-heading' },
  { id: 'refresh', chapter: 'historique', path: '/historique', selector: '.heading-actions, .n40-history-table' },
  { id: 'notifications', chapter: 'compte', path: '/dashboard', selector: '.n9-trigger, .notifications' },
  { id: 'avatar', chapter: 'compte', path: '/dashboard', selector: '.na-avatar-trigger' },
  { id: 'profile', chapter: 'compte', path: '/profil', selector: '.na-profile-main .na-card:first-child' },
  { id: 'company', chapter: 'compte', path: '/profil', selector: '#entreprise' },
  { id: 'security', chapter: 'compte', path: '/profil', selector: '#securite' },
  { id: 'language', chapter: 'compte', path: '/parametres', selector: '#langue, .nashra-language-card' },
  { id: 'backup', chapter: 'compte', path: '/parametres', selector: '.setting-actions, .settings-grid' },
  { id: 'finish', chapter: 'intro', path: '/dashboard' },
];

const CHAPTERS: readonly Chapter[] = ['intro', 'annonces', 'telegram', 'groupes', 'agenda', 'historique', 'compte'];

const FRENCH: readonly (readonly [string, string])[] = [
  ['Bienvenue sur Nashra', 'Découvrons ensemble le parcours complet : créer une annonce, connecter Telegram, sélectionner des groupes autorisés, publier maintenant ou programmer, puis consulter le résultat. Vous n’enverrez rien pendant cette visite.'],
  ['Votre espace en un coup d’œil', 'L’accueil rassemble les raccourcis et les informations essentielles. Le tutoriel va maintenant ouvrir chaque véritable rubrique pour vous montrer ses commandes.'],
  ['Bibliothèque d’annonces', 'Toutes vos annonces sont ici : celles que vous créez et celles que vous importez depuis Telegram. Vous pourrez les reprendre autant de fois que nécessaire.'],
  ['Retrouver une annonce', 'Recherchez par titre, contenu ou mot-clé. Votre bibliothèque reste facile à utiliser même lorsque vous avez beaucoup d’annonces.'],
  ['Filtrer et changer de vue', 'Utilisez les catégories, les filtres, le tri et le passage cartes/liste pour organiser vos publications.'],
  ['Créer une nouvelle annonce', 'Voici le bouton « Nouvelle annonce ». Le guide peut ouvrir un formulaire vide pour vous montrer les champs, sans rien enregistrer.'],
  ['Titre et catégorie', 'Donnez un titre interne reconnaissable à votre annonce, puis choisissez sa catégorie. Ces informations servent surtout à vous organiser dans Nashra.'],
  ['Rédiger le message', 'Écrivez le texte tel que vous souhaitez le publier sur Telegram. Les retours à la ligne et la présentation du message sont importants.'],
  ['Photos et albums', 'Ajoutez vos images depuis l’ordinateur ou par URL pour l’aperçu, jusqu’à dix photos. Pour publier réellement une photo avec Nashra, privilégiez l’import depuis votre ordinateur vers Supabase.'],
  ['Tags et source du message', 'Ajoutez des mots-clés pour retrouver votre annonce et, si nécessaire, un lien vers le message Telegram d’origine. Ce lien n’envoie rien à lui seul.'],
  ['Aperçu et enregistrement', 'Prévisualisez l’annonce, puis cliquez sur « Créer l’annonce » lorsque vous avez rempli les champs. Pendant le tutoriel, aucun formulaire n’est soumis.'],
  ['Modifier, dupliquer et prévisualiser', 'Les cartes permettent de modifier, copier, dupliquer et prévisualiser une annonce existante. Si votre bibliothèque est vide, ces actions apparaîtront après votre première création.'],
  ['Publier maintenant', 'Depuis une annonce enregistrée, utilisez l’icône de publication pour ouvrir l’envoi immédiat. On va voir l’écran de confirmation, sans déclencher d’envoi.'],
  ['Choisir le groupe et confirmer', 'Sélectionnez un groupe autorisé, vérifiez l’annonce et confirmez seulement lorsque vous voulez vraiment publier. Nashra respecte les éventuelles restrictions de Telegram.'],
  ['Votre compte Telegram personnel', 'Nashra utilise votre compte personnel Telegram. Cette page indique si votre session est connectée et vous permet de la gérer.'],
  ['Connexion et vérification', 'Pour vous connecter, renseignez votre téléphone puis le code reçu dans Telegram. Si la vérification en deux étapes est activée, son mot de passe sera demandé. Ne partagez jamais ces codes.'],
  ['Vos groupes et canaux', 'Chargez les conversations auxquelles votre compte a accès. Vous pourrez choisir parmi les groupes ou canaux disponibles, sans ajouter un bot à chacun.'],
  ['Importer un message existant', 'Sélectionnez une conversation source et un message, puis utilisez l’importation pour récupérer son texte et ses photos compatibles dans la bibliothèque. L’importation n’envoie rien.'],
  ['Enregistrer un groupe autorisé', 'Vous pouvez aussi choisir une conversation et confirmer que les règles de ce groupe vous autorisent à y publier. Cette déclaration ne remplace pas les permissions Telegram.'],
  ['Vos destinations', 'Cette page réunit les groupes et canaux enregistrés, leur état d’autorisation et leur identifiant Telegram. Vous pourrez modifier ou retirer une destination.'],
  ['Ajouter une destination', 'Utilisez ce bouton pour enregistrer un groupe. Le formulaire s’ouvre ici seulement pour la démonstration.'],
  ['Identifiant Telegram du groupe', 'Renseignez le nom et l’identifiant numérique Telegram du groupe, par exemple un identifiant commençant par -100. Un simple lien t.me ne suffit pas pour ce parcours.'],
  ['Autorisation de publication', 'Cochez cette case uniquement si vous avez réellement le droit de publier dans le groupe. Les restrictions appliquées par Telegram restent prioritaires.'],
  ['Votre calendrier', 'Retrouvez les dates et les publications programmées. Une programmation n’est effective qu’après son acceptation par Telegram.'],
  ['Programmer une publication', 'Cliquez sur « Programmer » pour ouvrir une nouvelle programmation. Le guide n’effectuera aucune validation ni aucun envoi.'],
  ['Choisir une annonce', 'Sélectionnez une annonce déjà enregistrée dans votre bibliothèque. Donnez aussi un nom clair à la programmation pour la retrouver ensuite.'],
  ['Ponctuel ou récurrent ?', 'Choisissez « Une seule fois » pour une date unique, ou « Répéter automatiquement » pour diffuser de nouveau sans devoir recréer une campagne.'],
  ['Fréquence et fuseau horaire', 'Pour une répétition, choisissez par exemple tous les 2 jours. Indiquez votre fuseau (Asia/Riyadh, Europe/Paris…) et éventuellement une date de fin. La première diffusion fixe l’heure locale des suivantes.'],
  ['Choisir la date et l’heure', 'Indiquez le jour et l’heure souhaités. Pour une programmation native acceptée, Telegram prend ensuite en charge l’envoi, même lorsque Nashra est fermé.'],
  ['Sélectionner les groupes', 'Cochez uniquement les destinations autorisées. Vérifiez chaque groupe : le calendrier ne doit jamais remplacer votre décision de publication.'],
  ['Diffusion progressive dans les groupes', 'Nashra programme le premier groupe à l’heure choisie et chaque groupe suivant 90 secondes plus tard. Les occurrences futures nécessitent un réapprovisionnement quotidien par le serveur ; les quotas et règles Telegram s’appliquent.'],
  ['Confirmer la programmation', 'Le bouton de confirmation enregistre la demande et la transmet à Telegram. La programmation n’est confirmée que si Telegram l’accepte. Le tutoriel ne clique jamais dessus.'],
  ['Suivre ou annuler une programmation', 'Consultez les programmations, leurs états et leurs actions disponibles. Une suppression ou annulation effective dépend du type de programmation et du retour de Telegram.'],
  ['Historique des publications', 'Retrouvez les résultats des envois immédiats et des programmations, groupe par groupe. Les statuts distinguent les envois confirmés, les échecs et les livraisons encore à vérifier.'],
  ['Actualiser les résultats', 'Utilisez l’actualisation pour consulter les derniers résultats. Une programmation acceptée n’est pas automatiquement une livraison confirmée.'],
  ['Notifications', 'La cloche vous signale des événements utiles comme une erreur de synchronisation ou une campagne à venir. Vous pouvez consulter et marquer les notifications comme lues.'],
  ['Votre avatar et le menu du compte', 'Cliquez sur votre avatar pour retrouver le profil, les paramètres, la sécurité et le lien permettant de revoir ce guide.'],
  ['Informations personnelles', 'Depuis votre profil, vous pouvez modifier le nom affiché et votre avatar. Les informations enregistrées sont associées à votre compte.'],
  ['Votre entreprise', 'Personnalisez le nom de l’entreprise ou de l’espace de travail sans modifier vos annonces existantes.'],
  ['Sécurité du compte', 'La section sécurité permet notamment de modifier votre mot de passe. Prenez soin de vos accès Telegram et Supabase.'],
  ['Langue de l’interface', 'Choisissez parmi les onze langues ou laissez Nashra détecter celle de votre appareil. L’arabe et l’ourdou utilisent une interface de droite à gauche.'],
  ['Synchronisation et sauvegarde', 'Vérifiez la synchronisation de votre espace et exportez une sauvegarde de vos données. Les actions d’effacement sont destructives : ne les utilisez qu’en connaissance de cause.'],
  ['Vous connaissez Nashra !', 'Le parcours est terminé. Vous pouvez créer votre première annonce, la publier dans un groupe autorisé ou la programmer. Retrouvez ce guide à tout moment depuis votre avatar.'],
];
const ENGLISH: readonly (readonly [string, string])[] = [
  ['Welcome to Nashra', 'Follow the complete journey: create an announcement, connect Telegram, choose authorized groups, post now or schedule it, and check the result. Nothing will be sent during this tour.'],
  ['Your workspace at a glance', 'Home gathers your essentials. This guide will open each actual page so you can see where the controls live.'],
  ['Announcement library', 'Your announcements live here, both created manually and imported from Telegram. Reuse them whenever needed.'],
  ['Find an announcement', 'Search by title, text or keyword—even in a large library.'],
  ['Filters and display', 'Use categories, filters, sorting and card/list views to organize your content.'],
  ['Create a new announcement', 'This button opens a blank editor. The tour can show the fields without saving anything.'],
  ['Title and category', 'Give your announcement a clear internal title and a category to keep your library organized.'],
  ['Write your message', 'Enter the exact message you want to share on Telegram. Formatting and line breaks matter.'],
  ['Photos and albums', 'Add up to ten images from your computer, or URLs for previews. For actual image publishing, use computer uploads to Supabase.'],
  ['Tags and source link', 'Add keywords for searching and an optional link to the original Telegram message. A link alone does not post anything.'],
  ['Preview and save', 'Preview your work and then save it when ready. The tour never submits the form.'],
  ['Edit, duplicate and preview', 'Use announcement cards to edit, copy, duplicate or preview saved content. These controls appear after you have an announcement.'],
  ['Publish now', 'Open the immediate publishing flow from a saved announcement. We will show its confirmation without sending anything.'],
  ['Choose a group and confirm', 'Pick an authorized group and review the content. Confirm only when you intend to post. Telegram restrictions still apply.'],
  ['Your personal Telegram account', 'Nashra uses your personal Telegram session. Check its connection status and manage it here.'],
  ['Log in and verify', 'Enter your phone number, Telegram login code and, if enabled, your two-step verification password. Never share these codes.'],
  ['Groups and channels', 'Load conversations your Telegram account can access. No bot needs to be added to each group.'],
  ['Import an existing message', 'Choose a source chat and message to import its supported text and photos into the library. Importing never publishes.'],
  ['Save an authorized group', 'Select a conversation and confirm you are permitted to post. Your declaration does not override Telegram permissions.'],
  ['Your destinations', 'Review saved groups and channels, authorization states and numeric Telegram identifiers. Destinations can be edited or removed.'],
  ['Add a destination', 'Use this button to open the destination editor. The tour only opens a blank form.'],
  ['Telegram group identifier', 'Set a group name and its numeric Telegram ID, often beginning with -100. A t.me link alone is not enough.'],
  ['Posting authorization', 'Check this only when posting is actually permitted. Telegram restrictions always remain in effect.'],
  ['Your calendar', 'See scheduled dates and publications. A schedule is effective only after Telegram accepts it.'],
  ['Schedule a publication', 'Open a new scheduled publication. The guide never confirms or sends it.'],
  ['Choose an announcement', 'Select a saved announcement and give your schedule a recognizable name.'],
  ['One-time or recurring?', 'Choose One time for a single scheduled send, or Repeat automatically to reuse the same announcement on future dates.'],
  ['Interval and time zone', 'For recurring posts, select every 2 days for example. Set the time zone (such as Asia/Riyadh) and optionally an end date. The first publication sets the local time of later occurrences.'],
  ['Choose a date and time', 'Pick when to post. Once Telegram accepts native scheduling, it handles delivery even with Nashra closed.'],
  ['Select your groups', 'Check only approved destinations. Review each group before proceeding.'],
  ['Staggered group delivery', 'The first group starts at your chosen time; each additional group is scheduled 90 seconds later. A daily server job replenishes future occurrences, subject to Telegram rules and plan limits.'],
  ['Confirm the schedule', 'The confirmation button submits the request to Telegram. It counts as scheduled only after Telegram accepts it. The tour never clicks it.'],
  ['Manage schedules', 'Review status and available controls. Successful cancellation depends on the scheduling type and Telegram response.'],
  ['Publishing history', 'See actual publishing outcomes by destination, including confirmed posts, errors and deliveries pending verification.'],
  ['Refresh the results', 'Refresh to see updated outcomes. An accepted schedule is not proof of delivery.'],
  ['Notifications', 'The bell shows useful activity such as sync failures and upcoming campaigns. Review and mark notifications as read.'],
  ['Avatar and account menu', 'Open your avatar menu to find your profile, account settings, security and the option to replay this guide.'],
  ['Personal information', 'Update your name and avatar in your profile. The information belongs to your account.'],
  ['Your company', 'Set your workspace/company name without changing existing announcements.'],
  ['Account security', 'Use the security section to update your password. Keep your Telegram and Supabase access protected.'],
  ['Interface language', 'Choose from eleven languages or use your device language. Arabic and Urdu use right-to-left layouts.'],
  ['Sync and backup', 'Check cloud synchronization and export a backup. Data reset controls are destructive; use them carefully.'],
  ['You know Nashra!', 'The tour is complete. Create your first announcement, publish to an authorized group or schedule it. Replay this guide any time from your avatar.'],
];

// Every existing Nashra locale has translated tour controls and chapter names.
// French and English also provide the full, feature-specific explanations above.
// Additional localized descriptions are supplied below without changing UI data.
type Labels = {
  chapters: Record<Chapter, string>;
  previous: string;
  next: string;
  done: string;
  skip: string;
  pause: string;
  resume: string;
  explore: string;
  step: string;
  missing: string;
  readOnly: string;
  replay: string;
};
const LABELS: Record<Locale, Labels> = {
  fr: { chapters: {intro:'Bienvenue',annonces:'Annonces',telegram:'Telegram',groupes:'Groupes',agenda:'Calendrier',historique:'Historique',compte:'Mon compte'}, previous:'Précédent',next:'Suivant',done:'Terminer',skip:'Passer',pause:'Pause',resume:'Reprendre',explore:'Essayer moi-même',step:'Étape',missing:'Cette commande apparaît lorsque les éléments nécessaires sont configurés. Vous pouvez poursuivre la visite.',readOnly:'Visite guidée · aucun envoi ni sauvegarde automatique',replay:'Revoir le tutoriel' },
  en: { chapters:{intro:'Welcome',annonces:'Announcements',telegram:'Telegram',groupes:'Groups',agenda:'Calendar',historique:'History',compte:'Account'},previous:'Back',next:'Next',done:'Finish',skip:'Skip',pause:'Pause',resume:'Resume',explore:'Try it myself',step:'Step',missing:'This control appears once the required items are set up. You can continue the tour.',readOnly:'Guided tour · no publishing or automatic saving',replay:'Replay the tour' },
  ar: { chapters:{intro:'مرحبًا',annonces:'الإعلانات',telegram:'تيليجرام',groupes:'المجموعات',agenda:'التقويم',historique:'السجل',compte:'حسابي'},previous:'السابق',next:'التالي',done:'إنهاء',skip:'تخطي',pause:'إيقاف مؤقت',resume:'متابعة',explore:'التجربة بنفسي',step:'الخطوة',missing:'يظهر هذا الخيار بعد إعداد العناصر المطلوبة. يمكنك متابعة الجولة.',readOnly:'جولة إرشادية · دون نشر أو حفظ تلقائي',replay:'إعادة الجولة' },
  ru: { chapters:{intro:'Начало',annonces:'Объявления',telegram:'Telegram',groupes:'Группы',agenda:'Календарь',historique:'История',compte:'Аккаунт'},previous:'Назад',next:'Далее',done:'Завершить',skip:'Пропустить',pause:'Пауза',resume:'Продолжить',explore:'Попробовать',step:'Шаг',missing:'Этот элемент появится после необходимой настройки. Вы можете продолжить.',readOnly:'Обзор · без публикации и автосохранения',replay:'Повторить обзор' },
  es: { chapters:{intro:'Bienvenida',annonces:'Anuncios',telegram:'Telegram',groupes:'Grupos',agenda:'Calendario',historique:'Historial',compte:'Mi cuenta'},previous:'Anterior',next:'Siguiente',done:'Terminar',skip:'Omitir',pause:'Pausar',resume:'Continuar',explore:'Probar por mi cuenta',step:'Paso',missing:'Esta opción aparece cuando hayas configurado lo necesario. Puedes continuar.',readOnly:'Visita guiada · sin publicaciones ni guardados automáticos',replay:'Repetir tutorial' },
  it: { chapters:{intro:'Benvenuto',annonces:'Annunci',telegram:'Telegram',groupes:'Gruppi',agenda:'Calendario',historique:'Cronologia',compte:'Account'},previous:'Indietro',next:'Avanti',done:'Fine',skip:'Salta',pause:'Pausa',resume:'Riprendi',explore:'Prova da solo',step:'Passaggio',missing:'Questo comando appare dopo la configurazione necessaria. Puoi continuare.',readOnly:'Visita guidata · nessuna pubblicazione o salvataggio automatico',replay:'Rivedi il tutorial' },
  de: { chapters:{intro:'Willkommen',annonces:'Anzeigen',telegram:'Telegram',groupes:'Gruppen',agenda:'Kalender',historique:'Verlauf',compte:'Konto'},previous:'Zurück',next:'Weiter',done:'Fertig',skip:'Überspringen',pause:'Pause',resume:'Fortsetzen',explore:'Selbst ausprobieren',step:'Schritt',missing:'Diese Funktion erscheint nach der nötigen Einrichtung. Du kannst fortfahren.',readOnly:'Führung · kein Senden oder automatisches Speichern',replay:'Tour erneut starten' },
  id: { chapters:{intro:'Selamat datang',annonces:'Pengumuman',telegram:'Telegram',groupes:'Grup',agenda:'Kalender',historique:'Riwayat',compte:'Akun'},previous:'Kembali',next:'Lanjut',done:'Selesai',skip:'Lewati',pause:'Jeda',resume:'Lanjutkan',explore:'Coba sendiri',step:'Langkah',missing:'Kontrol ini muncul setelah prasyarat disiapkan. Anda bisa melanjutkan.',readOnly:'Tur panduan · tanpa kirim atau simpan otomatis',replay:'Ulangi panduan' },
  fil: { chapters:{intro:'Maligayang pagdating',annonces:'Mga anunsyo',telegram:'Telegram',groupes:'Mga grupo',agenda:'Kalendaryo',historique:'Kasaysayan',compte:'Account'},previous:'Bumalik',next:'Susunod',done:'Tapusin',skip:'Laktawan',pause:'I-pause',resume:'Ituloy',explore:'Subukan ko',step:'Hakbang',missing:'Lalabas ito kapag naayos na ang mga kailangan. Maaari kang magpatuloy.',readOnly:'Gabay lamang · walang ipinapadala o sine-save',replay:'Ulitin ang gabay' },
  tr: { chapters:{intro:'Hoş geldiniz',annonces:'İlanlar',telegram:'Telegram',groupes:'Gruplar',agenda:'Takvim',historique:'Geçmiş',compte:'Hesap'},previous:'Geri',next:'İleri',done:'Bitir',skip:'Atla',pause:'Duraklat',resume:'Devam et',explore:'Kendim deneyeyim',step:'Adım',missing:'Bu kontrol gerekli ayarlardan sonra görünür. Tura devam edebilirsiniz.',readOnly:'Rehber tur · gönderim veya otomatik kayıt yok',replay:'Turu yeniden göster' },
  ur: { chapters:{intro:'خوش آمدید',annonces:'اعلانات',telegram:'ٹیلیگرام',groupes:'گروپس',agenda:'کیلنڈر',historique:'تاریخچہ',compte:'اکاؤنٹ'},previous:'پچھلا',next:'اگلا',done:'مکمل',skip:'چھوڑیں',pause:'وقفہ',resume:'جاری رکھیں',explore:'خود آزمائیں',step:'مرحلہ',missing:'ضروری ترتیب مکمل ہونے پر یہ اختیار دکھائی دے گا۔ آپ آگے بڑھ سکتے ہیں۔',readOnly:'رہنمائی · کوئی پیغام نہیں بھیجا یا محفوظ کیا جاتا',replay:'دوبارہ رہنمائی' },
};

export const TOUR_REPLAY_LABELS: Record<Locale, string> = Object.fromEntries(
  Object.entries(LABELS).map(([language, value]) => [language, value.replay])
) as Record<Locale, string>;

const MODAL_TRIGGERS: Record<ModalName, string> = {
  announcement: '.n12-header-actions button, .heading-actions button',
  publish: '.n12-card-actions button[title="Publier maintenant"]',
  destination: '.heading-actions button',
  schedule: '.heading-actions button',
};
const EVENT = 'nashra:dashboard-tour:replay';
const REPLAY_PENDING = 'nashra:dashboard-tour:replay-pending';
const keyFor = (email?: string) => `nashra:dashboard-tour:complete:v3:${(email || 'local').trim().toLowerCase()}`;
const isRtl = (locale: Locale) => locale === 'ar' || locale === 'ur';

function findTarget(step: Step) {
  if (!step.selector) return null;
  try {
    const selectors = step.selector.split(',').map(part => part.trim());
    for (const selector of selectors) {
      const match = document.querySelector<HTMLElement>(selector);
      if (match) {
        const rect = match.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return match;
      }
    }
    return null;
  } catch { return null; }
}

export function DashboardTour({ userEmail, ready }: { userEmail?: string; ready: boolean }) {
  const { locale } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const text = LABELS[locale] ?? LABELS.en;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<{top: number; left: number; width: number; height: number} | null>(null);
  const [size, setSize] = useState({width: 1024, height: 768});
  const [targetMissing, setTargetMissing] = useState(false);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const autoChecked = useRef(false);
  const lastModal = useRef<ModalName | null>(null);
  const mobileNavOpenedByTour = useRef(false);
  const step = STEPS[index];
  const copy = locale === 'fr' ? FRENCH[index] : locale === 'en' ? ENGLISH[index] : (EXTRA_COPY[locale]?.[index] ?? ENGLISH[index]);

  const start = useCallback((resume = false) => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const saved = (() => { try { return localStorage.getItem(keyFor(userEmail)); } catch { return null; } })();
    const paused = saved?.startsWith('paused:') ? Number(saved.slice(7)) : NaN;
    setIndex(resume && Number.isInteger(paused) && paused >= 0 && paused < STEPS.length ? paused : 0);
    setOpen(true);
  }, [userEmail]);

  const close = useCallback((mode: 'done' | 'pause') => {
    try { localStorage.setItem(keyFor(userEmail), mode === 'done' ? 'done' : `paused:${index}`); }
    catch { /* Storage may be blocked; the UI still closes. */ }
    setOpen(false);
  }, [index, userEmail]);

  useEffect(() => {
    if (!ready || pathname !== '/dashboard' || autoChecked.current) return;
    autoChecked.current = true;
    try {
      if (sessionStorage.getItem(REPLAY_PENDING) === '1') {
        sessionStorage.removeItem(REPLAY_PENDING);
        start(true);
        return;
      }
      // Existing V1 walkthroughs are intentionally not counted as complete:
      // this significantly expanded V2 deserves one first-run walkthrough.
      if (localStorage.getItem(keyFor(userEmail)) === null) start();
    } catch { /* User can always relaunch the tutorial from the avatar. */ }
  }, [ready, pathname, userEmail, start]);

  useEffect(() => {
    const replay = () => {
      if (ready) start(true);
      else {
        try { sessionStorage.setItem(REPLAY_PENDING, '1'); } catch { /* ignore */ }
        router.push('/dashboard');
      }
    };
    window.addEventListener(EVENT, replay);
    return () => window.removeEventListener(EVENT, replay);
  }, [ready, router, start]);

  useEffect(() => {
    if (!open || !ready || !step) return;
    if (pathname !== step.path) { router.push(step.path); return; }
    const timer = window.setTimeout(() => {
      if (['calendarinterval','calendardate','calendargroups','calendarstagger'].includes(step.id))
        window.dispatchEvent(new Event('nashra:tour:show-recurrence'));
      const current = document.querySelector<HTMLElement>('.modal-cover');
      if (lastModal.current && (!step.modal || lastModal.current !== step.modal)) {
        current?.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')?.click();
        lastModal.current = null;
        if (step.modal) {
          window.setTimeout(() => {
            if (!document.querySelector('.modal-cover')) {
              const button = document.querySelector<HTMLButtonElement>(MODAL_TRIGGERS[step.modal!]);
              if (button && !button.disabled) { button.click(); lastModal.current = step.modal!; }
            }
          }, 180);
        }
        return;
      }
      if (step.modal && !current) {
        const button = document.querySelector<HTMLButtonElement>(MODAL_TRIGGERS[step.modal]);
        if (button && !button.disabled) { button.click(); lastModal.current = step.modal; }
      }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [open, ready, pathname, index, router, step]);

  // On mobile, open navigation only for an explicit sidebar spotlight, then
  // restore the previous state. Normal page highlights remain unobstructed.
  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    if (mobile && step.sidebar && !document.querySelector('.sidebar.sidebar-open')) {
      document.querySelector<HTMLButtonElement>('.mobile-menu')?.click();
      mobileNavOpenedByTour.current = true;
    } else if (mobileNavOpenedByTour.current && !step.sidebar) {
      document.querySelector<HTMLButtonElement>('.mob-close')?.click();
      mobileNavOpenedByTour.current = false;
    }
  }, [open, step]);

  useEffect(() => {
    if (!open || pathname !== step.path) { setSpotlight(null); return; }
    let frame = 0;
    let timeout = 0;
    let focusedStep = '';
    const measure = () => {
      setSize(prev => prev.width === window.innerWidth && prev.height === window.innerHeight ? prev : {width:window.innerWidth, height:window.innerHeight});
      const target = findTarget(step);
      if (target && focusedStep !== step.id) {
        focusedStep = step.id;
        target.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
      }
      const rect = target?.getBoundingClientRect();
      const visible = Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth);
      setTargetMissing(prev => prev === (!visible && !!step.selector) ? prev : (!visible && !!step.selector));
      if (!visible || !rect) {
        setSpotlight(null);
      } else {
        const top = Math.max(8, rect.top - 5), left = Math.max(8, rect.left - 5);
        const candidate = {top, left, width: Math.max(0, Math.min(window.innerWidth - left - 8, rect.width + 10)), height: Math.max(0, Math.min(window.innerHeight - top - 8, rect.height + 10))};
        setSpotlight(prev => prev && Object.keys(candidate).every(k => Math.abs(prev[k as keyof typeof candidate] - candidate[k as keyof typeof candidate]) < 1) ? prev : candidate);
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.querySelector('.main-column') || document.body, {childList:true, subtree:true});
    schedule();
    timeout = window.setTimeout(schedule, 360);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.clearTimeout(timeout); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); };
  }, [open, index, pathname, step]);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function keyboard(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close('pause'); }
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === (isRtl(locale) ? 'ArrowLeft' : 'ArrowRight')) { e.preventDefault(); setIndex(i => Math.min(STEPS.length-1, i+1)); }
      if (e.key === (isRtl(locale) ? 'ArrowRight' : 'ArrowLeft')) { e.preventDefault(); setIndex(i => Math.max(0, i-1)); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', keyboard); };
  }, [open, close, locale]);

  useEffect(() => { if (open && ready && pathname === step.path) nextRef.current?.focus({preventScroll:true}); }, [open, ready, pathname, index, step.path]);
  useEffect(() => {
    if (open) return;
    if (mobileNavOpenedByTour.current) {
      document.querySelector<HTMLButtonElement>('.mob-close')?.click();
      mobileNavOpenedByTour.current = false;
    }
    // Close only a form opened by the tour, never a form opened by the user.
    if (lastModal.current) {
      document.querySelector<HTMLButtonElement>('.modal-cover button[aria-label="Fermer"]')?.click();
      lastModal.current = null;
    }
    previousFocus.current?.focus({preventScroll:true});
  }, [open]);

  if (!open || !ready) return null;

  const title = copy[0], description = copy[1];
  const noSpot = !spotlight || !step.selector || pathname !== step.path;
  const cardWidth = Math.min(420, size.width - 28);
  const mobile = size.width <= 760;
  const cardHeight = mobile ? 345 : 340;
  const top = noSpot ? Math.max(12, (size.height-cardHeight)/2) :
    mobile ? Math.max(12, size.height-cardHeight-12) :
      Math.min(Math.max(14, spotlight.top + spotlight.height/2 - cardHeight/2), Math.max(14,size.height-cardHeight-14));
  const left = noSpot || mobile ? (size.width-cardWidth)/2 :
    spotlight.left + spotlight.width + 22 + cardWidth < size.width-14 ? spotlight.left + spotlight.width+22 :
      spotlight.left - cardWidth-22 > 14 ? spotlight.left-cardWidth-22 : (size.width-cardWidth)/2;
  const sectionProgress = (index+1)/STEPS.length*100;
  return <div className="ntour2-root" dir={isRtl(locale) ? 'rtl' : 'ltr'}>
    <div className={`ntour2-curtain ${noSpot ? 'ntour2-curtain-full' : ''}`} aria-hidden="true" />
    {!noSpot && <div className="ntour2-spotlight" aria-hidden="true" style={{top:spotlight.top,left:spotlight.left,width:spotlight.width,height:spotlight.height}} />}
    <section className="ntour2-card" role="dialog" aria-modal="true" aria-labelledby="ntour2-title" aria-describedby="ntour2-desc" style={{top,left,width:cardWidth}}
      onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)'));
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length-1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls[controls.length-1]) { event.preventDefault(); controls[0]?.focus(); }
      }}>
      <header className="ntour2-header"><strong className="ntour2-brand">nashra<span>.</span></strong><span className="ntour2-quiet">{text.readOnly}</span><button className="ntour2-x" onClick={() => close('pause')} aria-label={text.pause}><X size={17}/></button></header>
      <div className="ntour2-track"><div style={{width:`${sectionProgress}%`}} /></div>
      <div className="ntour2-row"><label className="ntour2-chapters"><span className="ntour2-sr-only">{text.step}</span><select value={step.chapter} onChange={(e: ReactChangeEvent<HTMLSelectElement>) => { const next = STEPS.findIndex(x => x.chapter===e.target.value); if (next>=0) setIndex(next); }} aria-label="Choisir un chapitre">
        {CHAPTERS.map(c => <option key={c} value={c}>{text.chapters[c]}</option>)}
      </select><ChevronDown size={14}/></label><span className="ntour2-count">{text.step} {index+1} / {STEPS.length}</span></div>
      <h2 id="ntour2-title">{title}</h2>
      <p id="ntour2-desc">{description}</p>
      {targetMissing && pathname === step.path && <div className="ntour2-note">{text.missing}</div>}
      {pathname !== step.path && <div className="ntour2-note">{text.chapters[step.chapter]}…</div>}
      <footer className="ntour2-actions"><div className="ntour2-secondary"><button onClick={() => close('done')}>{text.skip}</button><button onClick={() => close('pause')}><Pause size={13}/>{text.pause}</button></div>
        <div className="ntour2-primary"><button className="ntour2-back" disabled={index===0} onClick={() => setIndex(i => Math.max(0,i-1))}><ArrowLeft size={15}/><span>{text.previous}</span></button>
          <button className="ntour2-next" ref={nextRef} onClick={() => index===STEPS.length-1 ? close('done') : setIndex(i => i+1)}>{index===STEPS.length-1 ? <><Check size={15}/>{text.done}</> : <>{text.next}<ArrowRight size={15}/></>}</button></div></footer>
      <button className="ntour2-explore" onClick={() => { lastModal.current = null; close('pause'); }}><Play size={13}/>{text.explore}</button>
    </section>
  </div>;
}

// Full explanations for each step in the nine other supported interface languages.
// Each line is one title and one explanation, in STEPS order.
const EXTRA_RAW: Partial<Record<Locale, string>> = {
  ar: `مرحبًا بك في نشرة§تعرف على الخطوات: إنشاء إعلان وربط تيليجرام واختيار المجموعات المسموح بها ثم النشر الفوري أو المجدول ومراجعة النتائج. لن نرسل شيئًا في هذه الجولة.
نظرة على المساحة§تعرض الصفحة الرئيسية المعلومات المهمة والاختصارات. سنزور كل صفحة ونتعرف على أدواتها.
مكتبة الإعلانات§تجد هنا الإعلانات التي أنشأتها أو استوردتها من تيليجرام لتعيد استخدامها متى شئت.
البحث عن إعلان§ابحث بالعنوان أو النص أو الكلمات المفتاحية للوصول إلى إعلانك بسهولة.
التصنيفات والعرض§نظم المحتوى باستخدام التصنيفات والتصفية والترتيب والعرض كبطاقات أو قائمة.
إنشاء إعلان جديد§يفتح الزر محررًا فارغًا لعرض الحقول فقط دون حفظ البيانات.
العنوان والتصنيف§أدخل عنوانًا واضحًا للإعلان واختر تصنيفه لتنظيم المكتبة.
كتابة النص§اكتب الرسالة كما تريد ظهورها في تيليجرام مع مراعاة تنسيق الأسطر.
الصور والألبومات§أضف حتى عشر صور. الروابط للمعاينة، أما النشر بالصور فيحتاج تحميلها من جهازك إلى Supabase.
الوسوم والرابط الأصلي§أضف وسومًا للبحث ورابط الرسالة الأصلية إن وُجد؛ الرابط وحده لا ينشر شيئًا.
المعاينة والحفظ§عاين المحتوى ثم احفظه عند الانتهاء. الجولة لا تضغط زر الحفظ.
تعديل الإعلان ونسخه§يمكن تعديل الإعلان ونسخه وتكراره ومعاينته من البطاقة بعد إنشائه.
النشر الآن§افتح إرسال إعلان محفوظ عبر زر النشر. سنعرض شاشة التأكيد دون إرسال أي رسالة.
اختيار المجموعة والتأكيد§اختر مجموعة مسموحًا بالنشر فيها وراجع المحتوى قبل التأكيد، مع الالتزام بقيود تيليجرام.
حساب تيليجرام الشخصي§تستخدم نشرة حسابك الشخصي. تحقق هنا من حالة الاتصال وإدارته.
تسجيل الدخول والتحقق§أدخل رقم الهاتف والرمز الذي يصلك في تيليجرام وكلمة مرور التحقق بخطوتين عند الحاجة. لا تشارك الرموز.
المجموعات والقنوات§حمّل المحادثات التي يستطيع حسابك الوصول إليها دون إضافة روبوت لكل مجموعة.
استيراد رسالة§اختر المحادثة والرسالة لاستيراد النص والصور المتاحة إلى المكتبة دون نشر.
حفظ مجموعة مصرح بها§حدد مجموعة وأكد أن قواعدها تسمح بالنشر؛ لا يغير هذا صلاحيات تيليجرام.
وجهات النشر§راجع المجموعات والقنوات المسجلة ومعرفاتها وحالة التصريح. يمكنك تعديلها أو حذفها.
إضافة وجهة§يفتح هذا الزر نموذج إضافة مجموعة فارغًا للشرح فقط.
معرف المجموعة§أدخل اسم المجموعة ومعرف تيليجرام الرقمي، غالبًا يبدأ بـ -100. الرابط وحده لا يكفي.
إذن النشر§حدد المربع فقط إن كنت مأذونًا فعلًا بالنشر. تبقى قيود تيليجرام سارية.
التقويم§شاهد المواعيد والمنشورات المجدولة. لا يصبح الموعد مؤكدًا إلا بعد قبول تيليجرام.
جدولة منشور§افتح نافذة جدولة جديدة. لن تؤكد الجولة أي إرسال.
اختيار إعلان§اختر إعلانًا محفوظًا واسمًا واضحًا للجدولة.
التاريخ والوقت§اختر موعد الإرسال. عند قبول الجدولة الأصلية، يتولى تيليجرام الإرسال حتى لو أغلقت نشرة.
اختيار المجموعات§اختر الوجهات المسموح بها فقط وراجع كل مجموعة.
تأكيد الجدولة§يرسل زر التأكيد طلب الجدولة إلى تيليجرام. الجولة لا تضغطه أبدًا.
إدارة المواعيد§راجع حالة المنشورات والخيارات المتاحة. نجاح الإلغاء يعتمد على رد تيليجرام.
سجل النشر§اطلع على النتائج الفعلية حسب المجموعة: المرسل والأخطاء وما ينتظر التحقق.
تحديث النتائج§حدّث السجل. قبول الجدولة لا يعني بالضرورة تأكيد التسليم.
الإشعارات§تظهر في الجرس أحداث مهمة مثل خطأ المزامنة أو موعد قادم.
الصورة الشخصية والقائمة§افتح صورتك للوصول إلى الملف والإعدادات والأمان وإعادة الجولة.
المعلومات الشخصية§يمكن تغيير الاسم والصورة الشخصية المرتبطين بحسابك.
بيانات الشركة§خصص اسم الشركة أو مساحة العمل دون تغيير الإعلانات السابقة.
أمان الحساب§يمكن تحديث كلمة المرور هنا. احم بيانات الوصول إلى تيليجرام وSupabase.
لغة الواجهة§اختر من إحدى عشرة لغة أو اكتشف لغة الجهاز تلقائيًا. العربية والأردية من اليمين لليسار.
المزامنة والنسخ الاحتياطي§تحقق من مزامنة بياناتك وصدر نسخة احتياطية. احذر أدوات حذف البيانات.
أصبحت جاهزًا!§يمكنك الآن إنشاء إعلان ونشره في مجموعة مأذون بها أو جدولته. أعد الجولة من صورتك الشخصية.`,
  ru: `Добро пожаловать в Nashra§Пройдём весь путь: создадим объявление, подключим Telegram, выберем разрешённые группы, отправим сразу или запланируем и проверим результат. Тур ничего не отправляет.
Главная страница§Здесь находятся главное и быстрые действия. Мы посетим реальные разделы приложения.
Библиотека объявлений§Здесь хранятся ваши объявления и записи, импортированные из Telegram.
Поиск объявления§Ищите по заголовку, содержимому или ключевому слову.
Фильтры и вид§Используйте категории, сортировку и отображение карточками или списком.
Новое объявление§Кнопка откроет пустой редактор только для знакомства с полями, без сохранения.
Название и категория§Придумайте понятное название и выберите категорию для порядка в библиотеке.
Текст сообщения§Напишите текст таким, каким он должен появиться в Telegram. Сохраняйте абзацы.
Фото и альбомы§Добавьте до десяти фотографий. URL служат для просмотра; для отправки фото загрузите с компьютера в Supabase.
Теги и исходная ссылка§Добавьте теги и при необходимости ссылку на исходный пост. Сама ссылка ничего не публикует.
Просмотр и сохранение§Проверьте сообщение и сохраните его, когда будете готовы. Во время тура форма не отправляется.
Редактирование и дублирование§Карточки позволяют редактировать, копировать, дублировать и просматривать объявления.
Опубликовать сейчас§Откройте отправку сохранённого объявления. Мы покажем подтверждение без публикации.
Группа и подтверждение§Выберите группу, где разрешена публикация, проверьте содержание и только потом подтверждайте.
Личный Telegram§Nashra работает через ваш личный аккаунт. Здесь видно состояние подключения.
Вход и проверка§Введите номер телефона, код Telegram и пароль двухэтапной проверки, если требуется. Никому их не передавайте.
Группы и каналы§Загрузите доступные аккаунту чаты. Добавлять бота в каждую группу не нужно.
Импорт сообщения§Выберите чат и сообщение для переноса текста и доступных фотографий без публикации.
Разрешённая группа§Добавьте чат только если правила позволяют писать туда. Подтверждение не меняет права Telegram.
Направления публикации§Проверьте сохранённые группы, числовые ID и разрешения. Записи можно редактировать.
Добавить группу§Эта кнопка открывает пустую форму для ознакомления.
Числовой ID§Укажите название и числовой ID группы, часто с началом -100. Ссылки t.me недостаточно.
Разрешение на публикацию§Отмечайте только при действительном разрешении. Ограничения Telegram остаются в силе.
Календарь§Здесь видны даты и расписание. Задание действует только после принятия Telegram.
Запланировать сообщение§Откройте форму планирования. Тур ничего не отправит.
Выбрать объявление§Выберите готовое объявление и задайте название расписанию.
Дата и время§Укажите время. Если Telegram принял встроенное расписание, он отправит сообщение даже при закрытом Nashra.
Выбор групп§Выбирайте только разрешённые группы и перепроверяйте список.
Подтвердить расписание§Кнопка отправляет запрос Telegram. Тур никогда её не нажимает.
Управление расписанием§Проверяйте статусы и доступные действия. Отмена зависит от ответа Telegram.
История публикаций§Здесь видны подтверждённые отправки, ошибки и результаты, требующие проверки.
Обновить результаты§Обновите список. Принятое расписание ещё не означает подтверждённую доставку.
Уведомления§Колокольчик показывает проблемы синхронизации и предстоящие кампании.
Аватар и меню§Через аватар открываются профиль, настройки, безопасность и повторный тур.
Личные сведения§Изменяйте имя и аватар в вашем профиле.
Компания§Настройте название компании или рабочего пространства.
Безопасность§Здесь можно сменить пароль. Берегите доступ к Telegram и Supabase.
Язык интерфейса§Выберите один из 11 языков или определение по устройству. Для арабского и урду включён RTL.
Синхронизация и копия§Проверьте синхронизацию и экспортируйте резервную копию. Удаление данных необратимо.
Готово!§Теперь можно создать объявление, отправить его в разрешённую группу или запланировать. Тур доступен в меню аватара.`,
  es: `Bienvenido a Nashra§Recorre todo el proceso: crear un anuncio, conectar Telegram, elegir grupos autorizados, publicar ahora o programar y consultar resultados. No se enviará nada durante la guía.
Tu espacio de trabajo§El inicio muestra la información y los accesos principales. Visitaremos cada página real.
Biblioteca de anuncios§Aquí están tus anuncios creados e importados desde Telegram, listos para reutilizar.
Buscar un anuncio§Encuentra anuncios por título, contenido o palabra clave.
Filtros y vistas§Organiza con categorías, filtros, orden y vista de tarjetas o lista.
Crear un anuncio§Este botón abre un formulario vacío para mostrar sus campos sin guardar nada.
Título y categoría§Introduce un título claro y elige una categoría para organizarte.
Escribir el texto§Redacta el mensaje tal como quieres enviarlo a Telegram y respeta los saltos de línea.
Fotos y álbumes§Añade hasta diez fotos. Las URL sirven para vista previa; para publicar fotos, súbelas desde tu ordenador a Supabase.
Etiquetas y origen§Añade etiquetas y, si lo deseas, un enlace al mensaje de origen. El enlace no publica por sí solo.
Vista previa y guardar§Revisa el contenido y guárdalo cuando esté listo. La guía nunca envía el formulario.
Editar y duplicar§Las tarjetas permiten editar, copiar, duplicar y previsualizar anuncios guardados.
Publicar ahora§Abre el envío inmediato desde un anuncio. Veremos la confirmación sin publicar.
Elegir grupo y confirmar§Selecciona un grupo autorizado y verifica el anuncio antes de confirmar. Respetamos los límites de Telegram.
Tu Telegram personal§Nashra usa tu cuenta personal. Aquí puedes ver el estado de la conexión.
Inicio de sesión§Introduce tu teléfono, código de Telegram y contraseña de dos pasos si corresponde. No compartas los códigos.
Grupos y canales§Carga las conversaciones accesibles a tu cuenta sin añadir un bot a cada grupo.
Importar un mensaje§Elige chat y mensaje para importar texto y fotos compatibles sin publicar.
Guardar grupo autorizado§Confirma que tienes permiso para publicar en el grupo; esto no cambia sus permisos reales.
Destinos§Revisa grupos guardados, sus permisos e identificadores numéricos. Puedes editarlos o quitarlos.
Añadir destino§Abre un formulario vacío para conocer los campos.
ID del grupo§Introduce nombre e ID numérico, a menudo empieza por -100. Un enlace t.me no basta.
Permiso para publicar§Marca la casilla solo cuando está permitido. Telegram sigue aplicando sus restricciones.
Calendario§Consulta fechas y publicaciones programadas. Solo son efectivas tras la aceptación de Telegram.
Nueva programación§Abre el formulario. Esta visita no confirmará ningún envío.
Elegir anuncio§Selecciona un anuncio guardado y pon nombre a la programación.
Fecha y hora§Define el horario. Si Telegram acepta la programación nativa, hará el envío aunque Nashra esté cerrado.
Elegir grupos§Marca solo destinos autorizados y comprueba cada selección.
Confirmar programación§La confirmación envía la solicitud a Telegram. La visita nunca pulsa ese botón.
Gestionar programaciones§Consulta estados y acciones disponibles. La cancelación depende de Telegram.
Historial de publicaciones§Consulta envíos confirmados, errores y resultados pendientes de verificar por grupo.
Actualizar resultados§Actualiza el historial. Una programación aceptada no prueba su entrega final.
Notificaciones§La campana muestra errores de sincronización y campañas próximas.
Avatar y menú§Accede al perfil, la configuración y la opción de repetir la visita.
Datos personales§Edita tu nombre y avatar desde el perfil.
Tu empresa§Personaliza el nombre de tu empresa o espacio de trabajo.
Seguridad de la cuenta§Cambia la contraseña y protege el acceso a Telegram y Supabase.
Idioma de la interfaz§Elige entre once idiomas o detecta el del dispositivo; árabe y urdu usan RTL.
Sincronización y copia§Verifica la sincronización y exporta tus datos. Cuidado con las opciones de borrado.
¡Todo listo!§Ya puedes crear un anuncio, publicarlo en un grupo permitido o programarlo. Repite la visita desde tu avatar.`,
  it: `Benvenuto in Nashra§Scopri tutto il percorso: crea un annuncio, collega Telegram, scegli i gruppi autorizzati, pubblica ora o programma e controlla il risultato. Il tour non invia nulla.
La tua area di lavoro§La home raccoglie informazioni e scorciatoie. Visiteremo le pagine reali.
Libreria degli annunci§Qui trovi gli annunci creati o importati da Telegram da riutilizzare.
Cercare un annuncio§Cerca per titolo, testo o parola chiave.
Filtri e visualizzazione§Usa categorie, ordinamento e vista schede o elenco.
Creare un annuncio§Questo pulsante apre il modulo vuoto per mostrarne i campi, senza salvare.
Titolo e categoria§Scegli un titolo riconoscibile e una categoria per organizzarti.
Scrivere il messaggio§Scrivi il testo come deve apparire su Telegram, mantenendo i paragrafi.
Foto e album§Aggiungi fino a dieci immagini. I link servono all'anteprima; per pubblicare foto caricale dal computer su Supabase.
Tag e link originale§Aggiungi tag e, se utile, il link al messaggio originale. Il link da solo non pubblica.
Anteprima e salvataggio§Controlla l'annuncio e salvalo quando è pronto. Il tour non invia moduli.
Modificare e duplicare§Dalle schede puoi modificare, copiare, duplicare e vedere gli annunci.
Pubblica ora§Apri l'invio immediato di un annuncio salvato. Nessun messaggio sarà inviato durante il tour.
Gruppo e conferma§Scegli un gruppo autorizzato e controlla prima di confermare. Valgono sempre le restrizioni Telegram.
Il tuo Telegram personale§Nashra usa il tuo account personale. Qui controlli la connessione.
Accesso e verifica§Inserisci telefono, codice Telegram e password in due passaggi se richiesta. Non condividere i codici.
Gruppi e canali§Carica le chat accessibili senza aggiungere un bot a ogni gruppo.
Importare un messaggio§Seleziona chat e messaggio per importare testo e foto compatibili senza pubblicare.
Gruppo autorizzato§Conferma che le regole permettono di pubblicare. Questo non cambia i permessi Telegram.
Destinazioni§Controlla gruppi registrati, permessi e ID numerici. Puoi modificarli o rimuoverli.
Aggiungere una destinazione§Apri il modulo vuoto per conoscere i campi.
ID del gruppo§Inserisci nome e ID numerico, spesso inizia con -100. Un link t.me non basta.
Autorizzazione§Spunta solo se sei davvero autorizzato a pubblicare. Restano i limiti Telegram.
Calendario§Vedi date e pubblicazioni programmate. La richiesta vale solo se Telegram la accetta.
Programmare§Apri il modulo della programmazione. Il tour non invia nulla.
Scegliere l'annuncio§Seleziona un annuncio salvato e assegna un nome alla programmazione.
Data e ora§Scegli quando inviare. Se Telegram accetta la programmazione nativa, invierà anche con Nashra chiuso.
Scegliere i gruppi§Seleziona solo destinazioni autorizzate e controlla l'elenco.
Confermare la programmazione§Il pulsante invia la richiesta a Telegram. Il tour non lo preme.
Gestire gli invii§Controlla stati e azioni. L'annullamento dipende dalla risposta Telegram.
Cronologia§Vedi invii confermati, errori e risultati da verificare per gruppo.
Aggiornare i risultati§Aggiorna la cronologia. La programmazione accettata non prova l'avvenuta consegna.
Notifiche§La campanella segnala errori di sincronizzazione e campagne imminenti.
Avatar e menu§Apri profilo, impostazioni, sicurezza e ripeti il tutorial.
Informazioni personali§Modifica nome e avatar nel profilo.
La tua azienda§Imposta il nome aziendale o dello spazio di lavoro.
Sicurezza§Aggiorna la password e proteggi gli accessi a Telegram e Supabase.
Lingua dell'interfaccia§Scegli una delle undici lingue o usa quella del dispositivo; arabo e urdu hanno RTL.
Sincronizzazione e backup§Controlla la sincronizzazione ed esporta una copia. Le azioni di eliminazione sono pericolose.
Hai finito!§Ora puoi creare, pubblicare in un gruppo autorizzato o programmare. Riapri il tour dal tuo avatar.`,
  de: `Willkommen bei Nashra§Wir zeigen den ganzen Ablauf: Anzeige erstellen, Telegram verbinden, erlaubte Gruppen wählen, jetzt senden oder planen und Ergebnisse prüfen. Die Tour sendet nichts.
Dein Arbeitsbereich§Auf der Startseite stehen die wichtigsten Informationen und Verknüpfungen. Wir besuchen die echten Seiten.
Anzeigenbibliothek§Hier liegen selbst erstellte und aus Telegram importierte Anzeigen zur Wiederverwendung.
Anzeige suchen§Suche nach Titel, Text oder Stichwort.
Filter und Ansichten§Nutze Kategorien, Filter, Sortierung und Karten- oder Listenansicht.
Neue Anzeige erstellen§Dieser Knopf öffnet ein leeres Formular, ohne Daten zu speichern.
Titel und Kategorie§Vergib einen klaren internen Titel und eine passende Kategorie.
Nachricht schreiben§Schreibe den Text so, wie er in Telegram erscheinen soll. Absätze bleiben wichtig.
Fotos und Alben§Füge bis zu zehn Bilder hinzu. URLs dienen der Vorschau; zum Veröffentlichen bitte über Supabase hochladen.
Tags und Quelllink§Füge Stichwörter und bei Bedarf den Link zur Originalnachricht hinzu. Der Link sendet nichts.
Vorschau und Speichern§Prüfe den Inhalt und speichere ihn erst danach. Die Tour sendet kein Formular ab.
Bearbeiten und duplizieren§Karten erlauben Bearbeiten, Kopieren, Duplizieren und Vorschau.
Jetzt veröffentlichen§Öffne das direkte Senden einer gespeicherten Anzeige. Die Tour verschickt nichts.
Gruppe und Bestätigung§Wähle eine berechtigte Gruppe und prüfe den Inhalt vor dem Bestätigen. Telegram-Regeln gelten weiter.
Persönliches Telegram§Nashra nutzt dein persönliches Konto. Hier siehst du den Verbindungsstatus.
Anmelden und prüfen§Gib Telefonnummer, Telegram-Code und bei Bedarf das Passwort der Zwei-Faktor-Prüfung ein. Nie weitergeben.
Gruppen und Kanäle§Lade erreichbare Gespräche, ohne in jeder Gruppe einen Bot hinzuzufügen.
Nachricht importieren§Wähle Chat und Nachricht, um Text und unterstützte Fotos ohne Veröffentlichung zu übernehmen.
Erlaubte Gruppe speichern§Bestätige nur echte Erlaubnis. Das ändert keine Telegram-Berechtigungen.
Ziele§Sieh gespeicherte Gruppen, Berechtigungen und numerische Kennungen. Einträge sind bearbeitbar.
Ziel hinzufügen§Der Knopf öffnet ein leeres Formular zur Erklärung.
Telegram-Gruppen-ID§Trage Namen und numerische ID ein, oft mit -100. Ein t.me-Link reicht nicht.
Erlaubnis zur Veröffentlichung§Setze das Häkchen nur bei wirklicher Erlaubnis. Telegram-Beschränkungen bleiben bestehen.
Kalender§Hier stehen Termine und geplante Nachrichten. Erst Telegrams Annahme bestätigt die Planung.
Veröffentlichung planen§Öffne das Planungsformular. Die Tour löst nichts aus.
Anzeige auswählen§Wähle eine gespeicherte Anzeige und benenne den Termin.
Datum und Uhrzeit§Lege den Zeitpunkt fest. Nach Annahme durch Telegram kann die Nachricht auch bei geschlossenem Nashra gesendet werden.
Gruppen auswählen§Wähle ausschließlich berechtigte Ziele und prüfe sie.
Planung bestätigen§Die Bestätigung sendet die Anfrage an Telegram. Die Tour klickt nicht darauf.
Termine verwalten§Prüfe Status und Aktionen. Eine Stornierung hängt von Telegram ab.
Verlauf§Sieh bestätigte Sendungen, Fehler und noch zu prüfende Ergebnisse pro Gruppe.
Ergebnisse aktualisieren§Aktualisiere die Liste. Ein angenommener Termin beweist noch keine Zustellung.
Benachrichtigungen§Die Glocke zeigt Synchronisierungsprobleme und anstehende Kampagnen.
Avatar und Konto§Über das Avatar-Menü erreichst du Profil, Einstellungen und diese Tour.
Persönliche Angaben§Ändere Namen und Avatar im Profil.
Unternehmen§Passe Firmen- oder Arbeitsbereichsnamen an.
Kontosicherheit§Ändere hier dein Passwort und schütze Telegram- und Supabase-Zugänge.
Sprache§Wähle aus elf Sprachen oder der Gerätesprache. Arabisch und Urdu nutzen RTL.
Synchronisation und Backup§Prüfe die Synchronisation und exportiere ein Backup. Datenlöschung ist endgültig.
Geschafft!§Erstelle nun eine Anzeige und veröffentliche sie in einer erlaubten Gruppe oder plane sie. Die Tour ist im Avatar-Menü verfügbar.`,
  id: `Selamat datang di Nashra§Ikuti alur lengkap: buat pengumuman, hubungkan Telegram, pilih grup berizin, kirim sekarang atau jadwalkan, lalu lihat hasil. Tur ini tidak mengirim apa pun.
Ruang kerja Anda§Beranda menampilkan informasi dan pintasan penting. Kita akan membuka halaman yang sebenarnya.
Pustaka pengumuman§Semua pengumuman yang dibuat atau diimpor dari Telegram tersedia di sini.
Cari pengumuman§Cari berdasarkan judul, isi, atau kata kunci.
Filter dan tampilan§Atur dengan kategori, filter, pengurutan, dan tampilan kartu atau daftar.
Buat pengumuman§Tombol ini membuka formulir kosong untuk melihat kolom tanpa menyimpan.
Judul dan kategori§Masukkan judul internal yang jelas dan pilih kategorinya.
Tulis pesan§Ketik isi sebagaimana ingin ditampilkan di Telegram, termasuk jeda baris.
Foto dan album§Tambahkan hingga sepuluh foto. URL untuk pratinjau; unggah dari komputer ke Supabase untuk penerbitan foto.
Tag dan sumber§Tambahkan tag dan tautan pesan asli jika perlu. Tautan saja tidak menerbitkan apa pun.
Pratinjau dan simpan§Periksa pengumuman lalu simpan saat siap. Tur tidak mengirim formulir.
Edit dan duplikasi§Kartu memungkinkan edit, salin, duplikasi, serta pratinjau pengumuman yang tersimpan.
Terbitkan sekarang§Buka alur penerbitan langsung dari pengumuman. Tur hanya menunjukkan konfirmasi.
Pilih grup dan konfirmasi§Pilih grup yang mengizinkan penerbitan dan periksa isi sebelum konfirmasi. Aturan Telegram tetap berlaku.
Telegram pribadi Anda§Nashra menggunakan akun Telegram pribadi. Periksa status koneksinya di sini.
Masuk dan verifikasi§Masukkan nomor telepon, kode Telegram, dan kata sandi verifikasi dua langkah jika diminta. Jangan bagikan kode.
Grup dan kanal§Muat percakapan yang dapat diakses akun tanpa perlu menambah bot.
Impor pesan§Pilih percakapan dan pesan untuk mengimpor teks dan foto yang didukung tanpa mengirimnya.
Simpan grup berizin§Konfirmasikan bahwa aturan grup mengizinkan Anda mengirim. Ini tidak mengubah izin Telegram.
Tujuan penerbitan§Lihat grup tersimpan, izin, dan ID numeriknya. Anda dapat mengedit atau menghapus tujuan.
Tambah tujuan§Tombol ini membuka formulir kosong untuk penjelasan.
ID grup Telegram§Isi nama dan ID numerik, sering diawali -100. Tautan t.me saja tidak cukup.
Izin menerbitkan§Centang hanya jika Anda benar-benar diizinkan. Batasan Telegram tetap berlaku.
Kalender§Lihat tanggal dan pesan terjadwal. Jadwal berlaku setelah disetujui Telegram.
Jadwalkan pesan§Buka formulir jadwal. Tur tidak mengonfirmasi pengiriman.
Pilih pengumuman§Pilih pengumuman tersimpan dan beri nama jadwal.
Tanggal dan waktu§Tentukan waktu. Setelah diterima Telegram, jadwal native bisa berjalan meski Nashra ditutup.
Pilih grup§Centang hanya tujuan berizin dan periksa kembali.
Konfirmasi jadwal§Tombol mengirim permintaan ke Telegram. Tur tidak pernah menekannya.
Kelola jadwal§Periksa status dan tindakan yang tersedia. Pembatalan bergantung pada tanggapan Telegram.
Riwayat penerbitan§Lihat pengiriman terkonfirmasi, kesalahan, dan status yang masih perlu diperiksa.
Perbarui hasil§Segarkan hasil. Jadwal yang diterima belum tentu terkirim.
Notifikasi§Ikon lonceng menunjukkan masalah sinkronisasi dan jadwal mendatang.
Avatar dan menu akun§Buka profil, pengaturan, keamanan, atau ulangi panduan melalui avatar.
Informasi pribadi§Ubah nama dan avatar di profil Anda.
Perusahaan§Atur nama perusahaan atau ruang kerja.
Keamanan akun§Perbarui kata sandi dan lindungi akses Telegram serta Supabase.
Bahasa antarmuka§Pilih salah satu dari 11 bahasa atau deteksi perangkat. Arab dan Urdu menggunakan RTL.
Sinkronisasi dan cadangan§Periksa sinkronisasi dan ekspor cadangan. Penghapusan data bersifat permanen.
Selesai!§Kini Anda bisa membuat, menerbitkan ke grup yang mengizinkan, atau menjadwalkan pesan. Ulangi panduan dari avatar.`,
  fil: `Maligayang pagdating sa Nashra§Alamin ang buong daloy: gumawa ng anunsyo, ikonekta ang Telegram, pumili ng awtorisadong grupo, mag-post ngayon o mag-iskedyul, at tingnan ang resulta. Walang ipapadala ang gabay.
Iyong workspace§Makikita sa home ang mahahalagang impormasyon at shortcut. Bibisitahin natin ang totoong mga pahina.
Library ng anunsyo§Narito ang mga ginawa at inangkat na anunsyo mula sa Telegram.
Maghanap ng anunsyo§Maghanap gamit ang pamagat, nilalaman o keyword.
Mga filter at view§Gumamit ng kategorya, filter, pag-uuri at card o list view.
Gumawa ng anunsyo§Magbubukas ito ng walang-lamang form para ipakita ang mga field, nang walang mase-save.
Pamagat at kategorya§Maglagay ng malinaw na pamagat at pumili ng kategorya.
Isulat ang mensahe§I-type kung ano mismo ang gustong makita sa Telegram, kasama ang mga bagong linya.
Mga larawan at album§Hanggang sampung larawan. Para sa aktuwal na pag-post ng larawan, mag-upload mula sa computer patungong Supabase.
Mga tag at source§Magdagdag ng keyword at link sa orihinal na mensahe kung kailangan. Hindi kusang nagpo-post ang link.
Preview at save§Suriin ang anunsyo at i-save kapag handa na. Hindi nagsu-submit ang tour.
I-edit at i-duplicate§Sa mga card puwedeng mag-edit, kumopya, mag-duplicate at mag-preview.
I-post ngayon§Buksan ang agarang pag-post ng naka-save na anunsyo. Hindi magpapadala ang tour.
Piliin ang grupo at kumpirmahin§Pumili lamang ng grupong pinapayagan at suriin bago mag-post. Umiiral pa rin ang patakaran ng Telegram.
Personal na Telegram§Personal na Telegram account mo ang ginagamit. Tingnan dito ang koneksyon.
Login at pag-verify§Ilagay ang numero, Telegram code at two-step password kung kailangan. Huwag ibahagi ang code.
Mga grupo at channel§I-load ang mga chat na naa-access ng iyong account, nang hindi kailangan ng bot.
Mag-import ng mensahe§Piliin ang chat at mensahe para kunin ang text at angkop na larawan nang walang pag-post.
Awtorisadong grupo§Kumpirmahing pinapayagan kang mag-post; hindi nito binabago ang pahintulot ng Telegram.
Mga destinasyon§Tingnan ang naka-save na grupo, pahintulot at numerong ID. Puwedeng baguhin o alisin.
Magdagdag ng destinasyon§Magbubukas ng blangkong form para maipakita ang mga field.
Telegram group ID§Ilagay ang pangalan at numerong ID, kadalasang nagsisimula sa -100. Hindi sapat ang t.me link.
Pahintulot sa pag-post§Markahan lamang kung totoong may pahintulot. Nalalapat pa rin ang mga limitasyon.
Kalendaryo§Tingnan ang mga iskedyul. Balido lamang kapag tinanggap ng Telegram.
Mag-iskedyul ng post§Buksan ang form ng iskedyul. Walang ipapadala ang tour.
Pumili ng anunsyo§Pumili ng naka-save na anunsyo at pangalanan ang iskedyul.
Petsa at oras§Piliin kung kailan. Kapag tinanggap ng Telegram, maaari itong magpadala kahit nakasara ang Nashra.
Pumili ng mga grupo§Pumili lamang ng awtorisadong destinasyon at suriin ang listahan.
Kumpirmahin ang iskedyul§Ipapadala nito ang request sa Telegram. Hindi pinipindot ng tour ang kumpirmasyon.
Pamahalaan ang iskedyul§Tingnan ang estado at opsyon. Ang pagkansela ay nakadepende sa Telegram.
Kasaysayan ng post§Makikita ang kumpirmadong post, error at mga resultang kailangan pang i-verify.
I-refresh ang resulta§I-refresh ang history. Ang tinanggap na iskedyul ay hindi garantiya ng delivery.
Mga abiso§Nagpapakita ang bell ng sync error at mga nalalapit na kampanya.
Avatar at account menu§Buksan ang profile, settings, seguridad at ulitin ang gabay.
Personal na impormasyon§Baguhin ang pangalan at avatar sa profile.
Iyong negosyo§I-set ang pangalan ng kumpanya o workspace.
Seguridad ng account§Palitan ang password at ingatan ang Telegram at Supabase access.
Wika ng interface§Pumili mula sa labing-isang wika o gamitin ang wika ng device. RTL ang Arabic at Urdu.
Sync at backup§Tingnan ang sync at mag-export ng backup. Permanenteng aksyon ang pagbura ng data.
Tapos na!§Maaari ka nang gumawa, mag-post sa awtorisadong grupo o mag-iskedyul. Ulitin ang tour mula sa avatar.`,
  tr: `Nashra'ya hoş geldiniz§Tüm adımları öğrenin: ilan oluşturma, Telegram bağlama, izinli grupları seçme, hemen gönderme veya zamanlama ve sonucu kontrol etme. Tur hiçbir mesaj göndermez.
Çalışma alanınız§Ana sayfa temel bilgileri ve kısayolları gösterir. Gerçek sayfaları birlikte gezeceğiz.
İlan kitaplığı§Oluşturduğunuz veya Telegram'dan içe aktardığınız ilanlar burada saklanır.
İlan arama§Başlık, metin veya anahtar kelime ile arama yapın.
Filtreler ve görünüm§Kategorileri, sıralamayı ve kart/liste görünümlerini kullanın.
Yeni ilan oluşturma§Bu düğme boş düzenleyiciyi açar; tur hiçbir şey kaydetmez.
Başlık ve kategori§Kolay tanınan bir başlık ve uygun kategori seçin.
Mesaj metni§Telegram'da görünmesini istediğiniz metni satırlarıyla birlikte yazın.
Fotoğraf ve albüm§En fazla on fotoğraf ekleyin. Gerçek fotoğraf gönderimi için bilgisayarınızdan Supabase'e yükleyin.
Etiketler ve kaynak§Arama etiketleri ve isteğe bağlı kaynak bağlantısı ekleyin. Bağlantı tek başına gönderim yapmaz.
Önizleme ve kaydetme§İçeriği kontrol ettikten sonra kaydedin. Tur formu göndermez.
Düzenleme ve çoğaltma§Kartlardan ilanları düzenleyebilir, kopyalayabilir, çoğaltabilir ve önizleyebilirsiniz.
Şimdi yayınla§Kaydedilmiş ilanın anında gönderimini açın. Tur mesaj göndermez.
Grup seçimi ve onay§Yalnızca izinli grup seçip içeriği kontrol edin. Telegram kısıtlamaları geçerlidir.
Kişisel Telegram§Nashra kişisel Telegram hesabınızı kullanır. Bağlantı durumunu burada görün.
Giriş ve doğrulama§Telefon, Telegram kodu ve gerekiyorsa iki aşamalı şifreyi girin. Kodları kimseyle paylaşmayın.
Gruplar ve kanallar§Bot eklemeden hesabınızın erişebildiği sohbetleri yükleyin.
Mesaj içe aktarma§Sohbet ve mesaj seçerek desteklenen metin ve fotoğrafları yayınlamadan aktarın.
İzinli grubu kaydetme§Kuralların paylaşmaya izin verdiğini doğrulayın. Bu işlem Telegram yetkilerini değiştirmez.
Hedefler§Kayıtlı grupları, izinleri ve sayısal kimlikleri görün; düzenleyin veya kaldırın.
Hedef ekleme§Bu düğme tanıtım için boş bir form açar.
Telegram grup kimliği§Grup adı ve çoğunlukla -100 ile başlayan sayısal kimliği girin. t.me bağlantısı yeterli değildir.
Yayın izni§Yalnızca gerçek izniniz varsa kutuyu işaretleyin. Telegram kısıtlamaları sürer.
Takvim§Planlanmış tarihler burada görünür. Telegram kabul etmeden plan etkin değildir.
Gönderi planlama§Planlama formunu açın. Tur herhangi bir gönderimi onaylamaz.
İlan seçimi§Kaydedilmiş bir ilan seçin ve planınıza anlaşılır bir ad verin.
Tarih ve saat§Zamanı seçin. Telegram yerel planlamayı kabul ederse Nashra kapalıyken de gönderir.
Grupları seçme§Yalnızca izinli hedefleri seçip kontrol edin.
Planı onaylama§Onay düğmesi isteği Telegram'a gönderir. Tur bu düğmeye basmaz.
Planları yönetme§Durumları ve seçenekleri inceleyin. İptal Telegram'ın yanıtına bağlıdır.
Yayın geçmişi§Onaylanmış gönderimler, hatalar ve doğrulanması gereken sonuçlar burada.
Sonuçları yenileme§Listeyi yenileyin. Kabul edilmiş plan kesin teslim anlamına gelmez.
Bildirimler§Zil, eşitleme hatalarını ve yaklaşan kampanyaları gösterir.
Avatar ve hesap menüsü§Profil, ayarlar, güvenlik ve turu tekrar başlatma burada.
Kişisel bilgiler§Adınızı ve avatarınızı profilinizden değiştirin.
Şirketiniz§Şirket veya çalışma alanı adını özelleştirin.
Hesap güvenliği§Şifrenizi güncelleyin; Telegram ve Supabase erişimini koruyun.
Arayüz dili§On bir dil arasından seçim yapın veya cihaz dilini kullanın. Arapça ve Urduca RTL'dir.
Eşitleme ve yedekleme§Eşitlemeyi denetleyin ve yedek dışa aktarın. Veri silme geri alınamaz.
Hazırsınız!§Artık ilan oluşturabilir, izinli gruba gönderebilir veya planlayabilirsiniz. Turu avatar menüsünden tekrar açın.`,
  ur: `نشرہ میں خوش آمدید§مکمل طریقہ سیکھیں: اعلان بنائیں، ٹیلیگرام منسلک کریں، اجازت والے گروپس منتخب کریں، ابھی پوسٹ کریں یا وقت مقرر کریں اور نتیجہ دیکھیں۔ اس رہنمائی میں کوئی پیغام نہیں بھیجا جائے گا۔
آپ کا ورک اسپیس§مرکزی صفحہ اہم معلومات اور شارٹ کٹس دکھاتا ہے۔ ہم اصل صفحات دیکھیں گے۔
اعلانات کی لائبریری§آپ کے بنائے ہوئے اور ٹیلیگرام سے درآمد شدہ اعلانات یہاں محفوظ ہوتے ہیں۔
اعلان تلاش کریں§عنوان، متن یا کلیدی لفظ سے تلاش کریں۔
فلٹر اور نظارے§زمرے، ترتیب اور کارڈ یا فہرست والے نظارے استعمال کریں۔
نیا اعلان بنائیں§یہ بٹن خالی فارم کھولتا ہے مگر رہنمائی کوئی معلومات محفوظ نہیں کرتی۔
عنوان اور زمرہ§آسانی سے پہچانے جانے والا عنوان اور مناسب زمرہ منتخب کریں۔
پیغام لکھیں§متن بالکل اس طرح لکھیں جیسے ٹیلیگرام میں دکھانا چاہتے ہیں۔
تصاویر اور البم§دس تک تصاویر شامل کریں۔ اصل پوسٹنگ کے لیے کمپیوٹر سے Supabase پر تصاویر اپ لوڈ کریں۔
ٹیگز اور اصل لنک§تلاش کے لیے ٹیگز اور ضرورت ہو تو اصل پیغام کا لنک شامل کریں۔ صرف لنک سے پوسٹ نہیں ہوتی۔
معائنہ اور محفوظ کرنا§پہلے اعلان دیکھیں پھر تیار ہونے پر محفوظ کریں۔ رہنمائی فارم جمع نہیں کراتی۔
ترمیم اور نقل§کارڈ سے اعلان میں ترمیم، نقل، دوہرا بنانا اور معائنہ ممکن ہے۔
ابھی شائع کریں§محفوظ اعلان کا فوری پوسٹ فارم کھولیں۔ رہنمائی کوئی پیغام نہیں بھیجتی۔
گروپ اور تصدیق§صرف مجاز گروپ منتخب کریں اور پوسٹ سے پہلے متن دیکھیں۔ ٹیلیگرام کی پابندیاں لاگو ہیں۔
ذاتی ٹیلیگرام§نشرہ آپ کا ذاتی ٹیلیگرام اکاؤنٹ استعمال کرتا ہے۔ یہاں کنکشن دیکھیں۔
لاگ ان اور تصدیق§فون نمبر، ٹیلیگرام کوڈ اور ضرورت پر دو مرحلہ پاس ورڈ دیں۔ کوڈ کسی سے شیئر نہ کریں۔
گروپس اور چینلز§اپنے اکاؤنٹ سے قابل رسائی گفتگوئیں لوڈ کریں۔ ہر گروپ میں بوٹ ضروری نہیں۔
پیغام درآمد کریں§گفتگو اور پیغام منتخب کر کے متن اور دستیاب تصاویر لائبریری میں لائیں، بغیر پوسٹ کیے۔
مجاز گروپ محفوظ کریں§صرف اسی گروپ کو مجاز قرار دیں جہاں آپ کو اجازت ہو۔ اس سے ٹیلیگرام کی اجازت نہیں بدلتی۔
منزلیں§محفوظ گروپس، اجازت اور عددی شناخت دیکھیں۔ ترمیم یا حذف بھی کر سکتے ہیں۔
منزل شامل کریں§یہ بٹن سمجھانے کے لیے خالی فارم کھولتا ہے۔
گروپ کی عددی شناخت§نام اور عددی ٹیلیگرام ID درج کریں، جو عموماً -100 سے شروع ہوتی ہے۔ صرف t.me لنک کافی نہیں۔
پوسٹ کی اجازت§صرف واقعی اجازت ہونے پر خانہ منتخب کریں۔ پابندیاں برقرار رہتی ہیں۔
کیلنڈر§طے شدہ تاریخیں دیکھیں۔ ٹیلیگرام کی منظوری کے بعد ہی شیڈول مؤثر ہے۔
پوسٹ شیڈول کریں§نیا شیڈول فارم کھولیں۔ رہنمائی کوئی درخواست نہیں بھیجتی۔
اعلان منتخب کریں§محفوظ اعلان منتخب کریں اور شیڈول کا واضح نام رکھیں۔
تاریخ اور وقت§وقت منتخب کریں۔ ٹیلیگرام کی قبول کردہ شیڈولنگ نشرہ بند ہونے پر بھی چل سکتی ہے۔
گروپس منتخب کریں§صرف مجاز گروپس منتخب کریں اور دوبارہ جائزہ لیں۔
شیڈول کی تصدیق§یہ بٹن درخواست ٹیلیگرام کو بھیجتا ہے۔ رہنمائی کبھی اسے نہیں دباتی۔
شیڈول کا انتظام§حیثیت اور دستیاب کارروائیاں دیکھیں۔ منسوخی ٹیلیگرام کے جواب پر منحصر ہے۔
اشاعت کی تاریخ§تصدیق شدہ پوسٹس، غلطیاں اور تصدیق کے منتظر نتائج دیکھیں۔
نتائج تازہ کریں§تاریخچہ تازہ کریں۔ قبول شدہ شیڈول کا مطلب یقینی ترسیل نہیں۔
اطلاعات§گھنٹی ہم آہنگی کی خرابی یا آنے والی مہمات دکھاتی ہے۔
اوتار اور اکاؤنٹ مینو§پروفائل، سیٹنگز، سیکیورٹی اور رہنمائی دوبارہ کھولیں۔
ذاتی معلومات§اپنا نام اور تصویر پروفائل سے بدلیں۔
آپ کی کمپنی§کمپنی یا ورک اسپیس کا نام حسب خواہش رکھیں۔
اکاؤنٹ سیکیورٹی§پاس ورڈ بدلیں اور ٹیلیگرام و Supabase تک رسائی محفوظ رکھیں۔
انٹرفیس کی زبان§گیارہ زبانوں میں سے منتخب کریں یا ڈیوائس کی زبان استعمال کریں۔ عربی اور اردو RTL ہیں۔
ہم آہنگی اور بیک اپ§ہم آہنگی چیک کریں اور بیک اپ برآمد کریں۔ حذف کرنے سے ڈیٹا ضائع ہو سکتا ہے۔
تیار ہیں!§اب اعلان بنائیں، مجاز گروپ میں شائع کریں یا شیڈول کریں۔ اوتار سے رہنمائی دوبارہ دیکھیں۔`,
};

const RECURRENCE_TOUR_COPY: Record<string, [string,string][]> = {
  'ar': [['مرة واحدة أم تكرار؟', 'اختر النشر مرة واحدة أو التكرار التلقائي لنشر الإعلان مجددًا في الأيام القادمة.'], ['الفاصل الزمني والمنطقة الزمنية', 'اختر مثلًا كل يومين وحدد المنطقة الزمنية وموعد انتهاء اختياريًا. يبقى الوقت المحلي ثابتًا.'], ['النشر التدريجي للمجموعات', 'تبدأ المجموعة الأولى في الوقت المحدد، ثم كل مجموعة تالية بعد ٩٠ ثانية. يجدد الخادم الجدولة يوميًا مع احترام الحدود.']],
  'ru': [['Однократно или регулярно?', 'Выберите разовую отправку или автоматическое повторение объявления в будущем.'], ['Интервал и часовой пояс', 'Укажите, например, каждые 2 дня, часовой пояс и при необходимости дату окончания. Местное время сохраняется.'], ['Постепенная рассылка', 'Первый чат получает сообщение по расписанию, каждый следующий — через 90 секунд. Сервер ежедневно продлевает расписание с учетом ограничений.']],
  'es': [['¿Una vez o recurrente?', 'Elige una publicación puntual o una repetición automática del mismo anuncio.'], ['Frecuencia y zona horaria', 'Elige, por ejemplo, cada 2 días, la zona horaria y una fecha final opcional. Se mantiene la hora local.'], ['Publicación gradual', 'El primer grupo comienza a la hora indicada; cada grupo adicional, 90 segundos después. El servidor renueva el calendario a diario.']],
  'it': [['Una volta o ricorrente?', 'Scegli una pubblicazione unica oppure la ripetizione automatica dello stesso annuncio.'], ['Frequenza e fuso orario', 'Seleziona ad esempio ogni 2 giorni, il fuso orario e facoltativamente una data di fine. L’ora locale rimane costante.'], ['Invio graduale nei gruppi', 'Il primo gruppo parte all’ora scelta, gli altri a intervalli di 90 secondi. Il server rinnova quotidianamente le programmazioni.']],
  'de': [['Einmalig oder regelmäßig?', 'Wähle eine einmalige Veröffentlichung oder eine automatische Wiederholung derselben Anzeige.'], ['Intervall und Zeitzone', 'Wähle zum Beispiel alle 2 Tage, die Zeitzone und bei Bedarf ein Enddatum. Die Ortszeit bleibt erhalten.'], ['Zeitversetzte Gruppen', 'Die erste Gruppe beginnt zur gewählten Zeit, jede weitere 90 Sekunden später. Der Server ergänzt zukünftige Termine täglich.']],
  'id': [['Sekali atau berulang?', 'Pilih satu kali terbit atau pengulangan otomatis untuk pengumuman yang sama.'], ['Jeda dan zona waktu', 'Pilih misalnya setiap 2 hari, zona waktu, dan tanggal akhir bila perlu. Waktu lokal tetap sama.'], ['Pengiriman bertahap', 'Grup pertama dijadwalkan sesuai waktu pilihan; grup berikutnya berjarak 90 detik. Server memperbarui jadwal setiap hari.']],
  'fil': [['Isang beses o paulit-ulit?', 'Piliin ang isang beses na pag-post o awtomatikong pag-ulit ng parehong anunsyo.'], ['Agwat at time zone', 'Pumili halimbawa ng bawat 2 araw, time zone, at opsyonal na petsa ng pagtatapos. Lokal na oras ang susundin.'], ['Sunod-sunod na pagpapadala', 'Mauuna ang unang grupo sa takdang oras at susunod ang iba nang may 90 segundong pagitan. Araw-araw ina-update ng server ang iskedyul.']],
  'tr': [['Tek sefer mi, tekrarlı mı?', 'Bir kez yayınlamayı veya aynı ilanı otomatik aralıklarla yeniden yayınlamayı seçin.'], ['Sıklık ve saat dilimi', 'Örneğin 2 günde bir, saat dilimini ve isteğe bağlı bitiş tarihini seçin. Yerel saat korunur.'], ['Gruplara kademeli gönderim', 'İlk grup seçilen saatte, sonraki her grup 90 saniye sonra gönderilir. Sunucu takvimi her gün yeniler.']],
  'ur': [['ایک بار یا بار بار؟', 'ایک بار شائع کرنے یا اسی اشتہار کو خودکار طور پر بار بار شائع کرنے کا انتخاب کریں۔'], ['وقفہ اور ٹائم زون', 'مثلاً ہر دو دن منتخب کریں، ٹائم زون اور اختیاری آخری تاریخ درج کریں۔ مقامی وقت برقرار رہے گا۔'], ['گروپوں میں وقفے سے اشاعت', 'پہلے گروپ میں مقررہ وقت پر، پھر ہر اگلے گروپ میں ۹۰ سیکنڈ بعد شیڈول ہوگا۔ سرور روزانہ اگلی تاریخیں شامل کرے گا۔']],
};

const EXTRA_COPY: Partial<Record<Locale, readonly (readonly [string, string])[]>> = Object.fromEntries(
  Object.entries(EXTRA_RAW).map(([language, content]) => {
    const rows = content.trim().split('\n').map(row => {
      const delimiter = row.indexOf('§');
      return delimiter === -1 ? [row, ''] : [row.slice(0, delimiter), row.slice(delimiter + 1)];
    });
    const additions = RECURRENCE_TOUR_COPY[language];
    if (additions) {
      rows.splice(26, 0, additions[0], additions[1]);
      rows.splice(30, 0, additions[2]);
    }
    return [language, rows];
  })
) as Partial<Record<Locale, readonly (readonly [string, string])[]>>;
