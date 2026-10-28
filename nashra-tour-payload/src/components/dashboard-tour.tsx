'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/provider';
import type { Locale } from '@/lib/i18n';

// The tour only explains existing Nashra features; it never sends a Telegram message.
type Copy = {
  titles: readonly [string, string, string, string, string, string, string];
  bodies: readonly [string, string, string, string, string, string, string];
  previous: string; next: string; finish: string; skip: string; replay: string; step: string;
};

const STRINGS: Record<Locale, Copy> = {
  fr: {
    titles: ['Bienvenue sur Nashra', 'Vos annonces', 'Votre compte Telegram', 'Vos destinations', 'Le calendrier', 'L’historique', 'Votre profil'],
    bodies: [
      'Un espace simple : créez une annonce, choisissez vos groupes, puis publiez maintenant ou programmez son envoi.',
      'Rédigez votre annonce, ajoutez des photos et retrouvez tous vos contenus au même endroit.',
      'Connectez votre compte personnel Telegram pour publier depuis votre propre compte.',
      'Sélectionnez uniquement les groupes où vous êtes autorisé à publier.',
      'Choisissez une date et une heure. Les messages acceptés par la programmation Telegram peuvent être envoyés même lorsque Nashra est fermé.',
      'Consultez les confirmations, programmations et erreurs de vos publications.',
      'Retrouvez votre avatar, vos informations personnelles et vos paramètres ici.'
    ],
    previous: 'Précédent', next: 'Suivant', finish: 'Terminer', skip: 'Passer', replay: 'Revoir le tutoriel', step: 'Étape'
  },
  en: {
    titles: ['Welcome to Nashra', 'Your announcements', 'Your Telegram account', 'Your destinations', 'Calendar', 'History', 'Your profile'],
    bodies: [
      'One simple flow: create an announcement, choose your groups, then publish now or schedule it.',
      'Write announcements, add photos, and keep all your content in one place.',
      'Connect your personal Telegram account to publish as yourself.',
      'Choose only groups where you have permission to post.',
      'Pick a date and time. Messages accepted by Telegram’s scheduling feature can be sent even when Nashra is closed.',
      'Review confirmations, scheduled posts, and publishing errors.',
      'Access your avatar, account details, and settings here.'
    ],
    previous: 'Back', next: 'Next', finish: 'Finish', skip: 'Skip', replay: 'Replay the tour', step: 'Step'
  },
  ar: {
    titles: ['مرحبًا بك في نشرة', 'إعلاناتك', 'حسابك على تيليجرام', 'وجهات النشر', 'التقويم', 'السجل', 'ملفك الشخصي'],
    bodies: [
      'خطوات بسيطة: أنشئ إعلانًا، واختر المجموعات، ثم انشر الآن أو حدّد موعدًا للنشر.',
      'اكتب إعلانك، وأضف الصور، واحتفظ بمحتواك في مكان واحد.',
      'اربط حسابك الشخصي على تيليجرام للنشر من حسابك.',
      'اختر المجموعات التي يُسمح لك بالنشر فيها فقط.',
      'اختر التاريخ والوقت. يمكن لتيليجرام إرسال الرسائل المجدولة التي قبلها حتى عند إغلاق نشرة.',
      'راجع تأكيدات النشر والمواعيد والأخطاء.',
      'يمكنك الوصول إلى صورتك الشخصية وبياناتك وإعداداتك من هنا.'
    ],
    previous: 'السابق', next: 'التالي', finish: 'إنهاء', skip: 'تخطي', replay: 'إعادة الجولة', step: 'الخطوة'
  },
  ru: {
    titles: ['Добро пожаловать в Nashra', 'Ваши объявления', 'Ваш Telegram', 'Куда публиковать', 'Календарь', 'История', 'Ваш профиль'],
    bodies: [
      'Всё просто: создайте объявление, выберите группы и опубликуйте сразу или по расписанию.',
      'Создавайте объявления, добавляйте фотографии и храните материалы в одном месте.',
      'Подключите личный аккаунт Telegram, чтобы публиковать от своего имени.',
      'Выбирайте только те группы, где вам разрешено публиковать.',
      'Укажите дату и время. Telegram может отправить принятые отложенные сообщения, даже если Nashra закрыта.',
      'Просматривайте подтверждения, отложенные сообщения и ошибки.',
      'Здесь находятся аватар, данные аккаунта и настройки.'
    ],
    previous: 'Назад', next: 'Далее', finish: 'Готово', skip: 'Пропустить', replay: 'Повторить обзор', step: 'Шаг'
  },
  es: {
    titles: ['Bienvenido a Nashra', 'Tus anuncios', 'Tu cuenta de Telegram', 'Tus destinos', 'Calendario', 'Historial', 'Tu perfil'],
    bodies: [
      'Es sencillo: crea un anuncio, elige tus grupos y publícalo ahora o prográmalo.',
      'Redacta anuncios, añade fotos y guarda todo tu contenido en un solo lugar.',
      'Conecta tu cuenta personal de Telegram para publicar desde ella.',
      'Selecciona solo grupos donde tengas permiso para publicar.',
      'Elige fecha y hora. Telegram puede enviar mensajes cuya programación haya aceptado incluso con Nashra cerrado.',
      'Consulta confirmaciones, publicaciones programadas y errores.',
      'Accede aquí a tu avatar, datos personales y ajustes.'
    ],
    previous: 'Atrás', next: 'Siguiente', finish: 'Finalizar', skip: 'Omitir', replay: 'Repetir guía', step: 'Paso'
  },
  it: {
    titles: ['Benvenuto in Nashra', 'I tuoi annunci', 'Il tuo Telegram', 'Le destinazioni', 'Calendario', 'Cronologia', 'Il tuo profilo'],
    bodies: [
      'È semplice: crea un annuncio, scegli i gruppi e pubblicalo subito o programmalo.',
      'Scrivi annunci, aggiungi foto e conserva tutto in un unico posto.',
      'Collega il tuo account Telegram personale per pubblicare a tuo nome.',
      'Seleziona solo i gruppi in cui hai il permesso di pubblicare.',
      'Scegli data e ora. Telegram può inviare i messaggi programmati accettati anche quando Nashra è chiuso.',
      'Controlla conferme, invii programmati ed errori.',
      'Qui trovi avatar, dati personali e impostazioni.'
    ],
    previous: 'Indietro', next: 'Avanti', finish: 'Fine', skip: 'Salta', replay: 'Rivedi la guida', step: 'Passo'
  },
  de: {
    titles: ['Willkommen bei Nashra', 'Deine Anzeigen', 'Dein Telegram-Konto', 'Deine Ziele', 'Kalender', 'Verlauf', 'Dein Profil'],
    bodies: [
      'Ganz einfach: Anzeige erstellen, Gruppen auswählen und sofort oder später veröffentlichen.',
      'Erstelle Anzeigen, füge Fotos hinzu und verwalte alles an einem Ort.',
      'Verbinde dein persönliches Telegram-Konto, um unter deinem Namen zu posten.',
      'Wähle nur Gruppen, in denen du posten darfst.',
      'Wähle Datum und Uhrzeit. Von Telegram angenommene geplante Nachrichten können auch bei geschlossenem Nashra gesendet werden.',
      'Sieh dir Bestätigungen, geplante Beiträge und Fehler an.',
      'Hier findest du Avatar, Kontodaten und Einstellungen.'
    ],
    previous: 'Zurück', next: 'Weiter', finish: 'Fertig', skip: 'Überspringen', replay: 'Tour wiederholen', step: 'Schritt'
  },
  id: {
    titles: ['Selamat datang di Nashra', 'Pengumuman Anda', 'Akun Telegram Anda', 'Tujuan publikasi', 'Kalender', 'Riwayat', 'Profil Anda'],
    bodies: [
      'Sederhana: buat pengumuman, pilih grup, lalu kirim sekarang atau jadwalkan.',
      'Tulis pengumuman, tambahkan foto, dan simpan semua konten di satu tempat.',
      'Hubungkan akun Telegram pribadi untuk mengirim dari akun Anda sendiri.',
      'Pilih hanya grup yang mengizinkan Anda memposting.',
      'Pilih tanggal dan waktu. Pesan terjadwal yang diterima Telegram dapat dikirim meski Nashra ditutup.',
      'Lihat konfirmasi, kiriman terjadwal, dan kesalahan.',
      'Akses avatar, detail akun, dan pengaturan di sini.'
    ],
    previous: 'Kembali', next: 'Lanjut', finish: 'Selesai', skip: 'Lewati', replay: 'Ulangi panduan', step: 'Langkah'
  },
  fil: {
    titles: ['Maligayang pagdating sa Nashra', 'Iyong mga anunsyo', 'Iyong Telegram account', 'Mga destinasyon', 'Kalendaryo', 'Kasaysayan', 'Iyong profile'],
    bodies: [
      'Simple lang: gumawa ng anunsyo, pumili ng mga grupo, at i-post ngayon o iiskedyul.',
      'Gumawa ng mga anunsyo, magdagdag ng larawan, at itago ang lahat sa iisang lugar.',
      'Ikonekta ang personal mong Telegram account upang mag-post gamit ito.',
      'Piliin lamang ang mga grupong pinapayagan kang mag-post.',
      'Pumili ng petsa at oras. Maaaring ipadala ng Telegram ang mga tinanggap nitong naka-iskedyul na mensahe kahit sarado ang Nashra.',
      'Tingnan ang kumpirmasyon, mga iskedyul, at mga error.',
      'Dito makikita ang avatar, detalye ng account, at settings.'
    ],
    previous: 'Bumalik', next: 'Susunod', finish: 'Tapusin', skip: 'Laktawan', replay: 'Ulitin ang gabay', step: 'Hakbang'
  },
  tr: {
    titles: ['Nashra’ya hoş geldiniz', 'İlanlarınız', 'Telegram hesabınız', 'Hedef gruplar', 'Takvim', 'Geçmiş', 'Profiliniz'],
    bodies: [
      'Çok basit: ilan oluşturun, grupları seçin, hemen paylaşın veya zamanlayın.',
      'İlan yazın, fotoğraf ekleyin ve içeriklerinizi tek yerde saklayın.',
      'Kendi hesabınızdan paylaşmak için kişisel Telegram hesabınızı bağlayın.',
      'Yalnızca paylaşım izniniz olan grupları seçin.',
      'Tarih ve saat seçin. Telegram’ın kabul ettiği zamanlanmış mesajlar Nashra kapalıyken de gönderilebilir.',
      'Onayları, zamanlanmış gönderileri ve hataları görüntüleyin.',
      'Avatarınıza, hesap bilgilerinize ve ayarlarınıza buradan ulaşın.'
    ],
    previous: 'Geri', next: 'İleri', finish: 'Bitir', skip: 'Atla', replay: 'Turu yeniden göster', step: 'Adım'
  },
  ur: {
    titles: ['نشرہ میں خوش آمدید', 'آپ کے اشتہارات', 'آپ کا ٹیلیگرام اکاؤنٹ', 'اشاعت کے گروپس', 'کیلنڈر', 'تاریخچہ', 'آپ کی پروفائل'],
    bodies: [
      'طریقہ آسان ہے: اشتہار بنائیں، گروپس منتخب کریں، پھر فوراً شائع کریں یا وقت مقرر کریں۔',
      'اشتہارات لکھیں، تصاویر شامل کریں اور اپنا تمام مواد ایک جگہ رکھیں۔',
      'اپنے نام سے پوسٹ کرنے کے لیے ذاتی ٹیلیگرام اکاؤنٹ جوڑیں۔',
      'صرف وہ گروپس منتخب کریں جہاں آپ کو پوسٹ کرنے کی اجازت ہو۔',
      'تاریخ اور وقت منتخب کریں۔ ٹیلیگرام میں منظور شدہ شیڈول پیغامات نشرہ بند ہونے پر بھی بھیجے جا سکتے ہیں۔',
      'تصدیقات، طے شدہ پوسٹس اور غلطیوں کی تفصیل دیکھیں۔',
      'یہاں اپنی تصویر، اکاؤنٹ کی تفصیل اور ترتیبات دیکھیں۔'
    ],
    previous: 'پچھلا', next: 'اگلا', finish: 'مکمل', skip: 'چھوڑ دیں', replay: 'رہنمائی دوبارہ دیکھیں', step: 'مرحلہ'
  },
};

export const TOUR_REPLAY_LABELS: Record<Locale, string> = Object.fromEntries(
  Object.entries(STRINGS).map(([language, copy]) => [language, copy.replay])
) as Record<Locale, string>;

const TARGETS = [null, '/annonces', '/telegram', '/groupes', '/campagnes', '/historique', 'profile'] as const;
const REPLAY_EVENT = 'nashra:dashboard-tour:replay';
const REPLAY_STORAGE = 'nashra:dashboard-tour:replay-pending';

function storageKey(email?: string) {
  return `nashra:dashboard-tour:v1:${(email || 'local').trim().toLowerCase()}`;
}
function getTarget(index: number): HTMLElement | null {
  const target = TARGETS[index];
  if (target === 'profile') return document.querySelector<HTMLElement>('.na-avatar-trigger');
  if (target) return Array.from(document.querySelectorAll<HTMLAnchorElement>('.nav-list a[href]'))
    .find(link => link.getAttribute('href') === target) || null;
  return null;
}
function visibleRect(element: HTMLElement): DOMRect {
  return element.getBoundingClientRect();
}

export function DashboardTour({ userEmail, ready }: { userEmail?: string; ready: boolean }) {
  const { locale } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const copy = STRINGS[locale] || STRINGS.en;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [highlight, setHighlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const nextRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const wasTourOpen = useRef(false);
  const mobileSidebarOpenedByTour = useRef(false);

  const openTour = useCallback(() => {
    if (typeof document === 'undefined') return;
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (pathname !== '/' || !ready) { setOpen(false); return; }
    try {
      if (sessionStorage.getItem(REPLAY_STORAGE) === '1') {
        sessionStorage.removeItem(REPLAY_STORAGE);
        openTour();
      } else if (localStorage.getItem(storageKey(userEmail)) !== 'done') openTour();
    } catch { /* Storage disabled: the tour can still be opened manually. */ }
  }, [pathname, ready, userEmail, openTour]);

  useEffect(() => {
    function replay() {
      if (pathname === '/' && ready) openTour();
      else {
        try { sessionStorage.setItem(REPLAY_STORAGE, '1'); } catch { /* ignore */ }
        router.push('/');
      }
    }
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, [pathname, ready, router, openTour]);

  const close = useCallback(() => {
    try { localStorage.setItem(storageKey(userEmail), 'done'); } catch { /* ignore */ }
    setOpen(false);
  }, [userEmail]);

  // Mobile navigation is normally off screen; expose it only for the relevant steps.
  useEffect(() => {
    if (!open) return;
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    if (!isMobile) return;
    if (index >= 1 && index <= 5) {
      if (!document.querySelector('.sidebar.sidebar-open')) {
        document.querySelector<HTMLButtonElement>('.mobile-menu')?.click();
        mobileSidebarOpenedByTour.current = true;
      }
    } else if (mobileSidebarOpenedByTour.current && document.querySelector('.sidebar.sidebar-open')) {
      document.querySelector<HTMLButtonElement>('.mob-close')?.click();
      mobileSidebarOpenedByTour.current = false;
    }
  }, [open, index]);

  useEffect(() => {
    if (wasTourOpen.current && !open && mobileSidebarOpenedByTour.current) {
      if (document.querySelector('.sidebar.sidebar-open')) document.querySelector<HTMLButtonElement>('.mob-close')?.click();
      mobileSidebarOpenedByTour.current = false;
    }
    wasTourOpen.current = open;
    if (!open) previouslyFocused.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) { setHighlight(null); return; }
    let raf = 0;
    function measure() {
      const target = getTarget(index);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      if (!target) { setHighlight(null); return; }
      const rectangle = visibleRect(target);
      if (rectangle.width <= 0 || rectangle.height <= 0 || rectangle.right < 0 || rectangle.left > window.innerWidth) {
        setHighlight(null);
        return;
      }
      setHighlight({
        top: Math.max(5, rectangle.top - 5), left: Math.max(5, rectangle.left - 5),
        width: Math.min(window.innerWidth - Math.max(5, rectangle.left - 5) - 5, rectangle.width + 10),
        height: rectangle.height + 10,
      });
    }
    function scheduleMeasure() { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); }
    const target = getTarget(index);
    if (target) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    scheduleMeasure();
    // Allow the mobile sidebar transition to finish before positioning the spotlight.
    const timer = window.setTimeout(measure, 260);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    return () => {
      cancelAnimationFrame(raf); window.clearTimeout(timer);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  useEffect(() => { if (open) nextRef.current?.focus({ preventScroll: true }); }, [open, index]);

  if (!open || pathname !== '/' || !ready) return null;

  const cardWidth = Math.min(370, viewport.width - 32);
  const mobile = viewport.width <= 760;
  const centered = !highlight || index === 0;
  const top = centered ? Math.max(12, (viewport.height - 285) / 2) :
    mobile ? viewport.height < 500 || highlight.top > viewport.height * .48
      ? 12 : Math.max(12, viewport.height - 280) :
    Math.min(Math.max(16, highlight.top + highlight.height / 2 - 135), Math.max(16, viewport.height - 290));
  const left = centered ? (viewport.width - cardWidth) / 2 :
    mobile ? (viewport.width - cardWidth) / 2 :
    highlight.left + highlight.width + 20 + cardWidth < viewport.width - 15 ? highlight.left + highlight.width + 20 :
    highlight.left - cardWidth - 20 > 15 ? highlight.left - cardWidth - 20 : (viewport.width - cardWidth) / 2;
  return <div className="ntour-root" dir={locale === 'ar' || locale === 'ur' ? 'rtl' : 'ltr'}>
    <div className={`ntour-intercept ${centered ? 'ntour-intro' : ''}`} aria-hidden="true" />
    {!centered && <div className="ntour-spotlight" aria-hidden="true" style={{
      top: highlight.top, left: highlight.left, width: Math.max(0, highlight.width), height: highlight.height,
    }}/>} 
    <div className="ntour-card" role="dialog" aria-modal="true" aria-labelledby="ntour-title" aria-describedby="ntour-desc"
      style={{ top, left, width: cardWidth }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="ntour-top"><span className="ntour-brand">nashra<span>.</span></span>
        <button type="button" className="ntour-close" onClick={close} aria-label={copy.skip}><X size={17}/></button></div>
      <div className="ntour-progress" role="progressbar" aria-label={copy.step} aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={TARGETS.length}>
        {TARGETS.map((_, step) => <span key={step} className={step <= index ? 'ntour-progress-done' : ''}/>)}
      </div>
      <div className="ntour-counter">{copy.step} {index + 1} / {TARGETS.length}</div>
      <h2 id="ntour-title">{copy.titles[index]}</h2>
      <p id="ntour-desc">{copy.bodies[index]}</p>
      <div className="ntour-actions">
        <button type="button" className="ntour-skip" onClick={close}>{copy.skip}</button>
        <div>
          {index > 0 && <button type="button" className="ntour-back" onClick={() => setIndex(i => i - 1)}><ArrowLeft size={15} />{copy.previous}</button>}
          <button ref={nextRef} type="button" className="ntour-next" onClick={() => index === TARGETS.length - 1 ? close() : setIndex(i => i + 1)}>
            {index === TARGETS.length - 1 ? <><Check size={15} />{copy.finish}</> : <>{copy.next}<ArrowRight size={15}/></>}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
