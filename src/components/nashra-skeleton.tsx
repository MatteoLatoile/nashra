import type { ReactNode } from 'react';
import styles from './nashra-skeleton.module.css';

export type SkeletonVariant =
  | 'dashboard' | 'annonces' | 'telegram' | 'groupes'
  | 'calendrier' | 'historique' | 'abonnement'
  | 'profil' | 'settings' | 'table' | 'generic';

const variants: Record<string, SkeletonVariant> = {
  '/dashboard': 'dashboard',
  '/annonces': 'annonces',
  '/telegram': 'telegram',
  '/groupes': 'groupes',
  '/campagnes': 'calendrier',
  '/planification': 'calendrier',
  '/automatisation': 'calendrier',
  '/historique': 'historique',
  '/file-attente': 'table',
  '/operations': 'table',
  '/supervision': 'table',
  '/surveillance-systeme': 'table',
  '/diagnostics': 'table',
  '/admin': 'table',
  '/abonnement': 'abonnement',
  '/limites': 'abonnement',
  '/profil': 'profil',
  '/parametres': 'settings',
};

export function skeletonVariantForPath(path: string | null | undefined): SkeletonVariant {
  return variants[path || ''] ?? 'generic';
}

function Bar({ width = '100%', height = 14, className = '' }: { width?: string; height?: number; className?: string }) {
  return <span className={`${styles.shimmer} ${styles.bar} ${className}`} style={{ width, height }} aria-hidden="true" />;
}
function Block({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={`${styles.panel} ${className}`}>{children}</div>;
}
function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${styles.row} ${className}`}>{children}</div>;
}
function Heading({ compact = false }: { compact?: boolean }) {
  return <div className={styles.heading}>
    <Bar width="155px" height={9} />
    <Bar width={compact ? '34%' : 'min(435px,80%)'} height={compact ? 27 : 38} />
    <Bar width="min(495px,86%)" height={11} />
  </div>;
}
function SmallCard() {
  return <Block className={styles.statCard}>
    <Bar width="35%" height={11} /><Bar width="69px" height={31} /><Bar width="59%" height={10} />
  </Block>;
}
function Card({ image = false }: { image?: boolean }) {
  return <Block className={styles.itemCard}>
    {image ? <span className={`${styles.shimmer} ${styles.cardMedia}`} aria-hidden="true" /> : <Bar width="42px" height={36} />}
    <div className={styles.cardBody}>
      <Bar width="40%" height={10} />
      <Bar width="83%" height={18} />
      <Bar width="70%" height={11} />
      <Bar width="54%" height={11} />
      <div className={styles.cardSpacer} />
      <Bar width="100%" height={1} />
      <Row><Bar width="46px" height={14} /><Bar width="29px" height={14} /><Bar width="29px" height={14} /></Row>
    </div>
  </Block>;
}
function GridCard({ count = 3, image = false }: { count?: number; image?: boolean }) {
  return <div className={styles.cards}>{Array.from({ length: count }, (_, i) => <Card image={image && i === 0} key={i} />)}</div>;
}
function Table({ rows = 6 }: { rows?: number }) {
  return <Block className={styles.tablePanel}>
    <Row className={styles.tableHeader}><Bar width="36%" height={12} /><Bar width="15%" height={12} /><Bar width="16%" height={12} /><Bar width="11%" height={12} /></Row>
    {Array.from({ length: rows }, (_, i) => <Row className={styles.tableRow} key={i}>
      <Bar width={i % 2 ? '31%' : '42%'} height={12} /><Bar width="13%" height={12} /><Bar width="18%" height={12} /><Bar width="8%" height={12} />
    </Row>)}
  </Block>;
}
function Form({ sections = 3 }: { sections?: number }) {
  return <Block className={styles.formPanel}>
    <Bar width="43%" height={12} /><Bar width="63%" height={22} />
    {Array.from({ length: sections }, (_, i) => <div className={styles.formGroup} key={i}>
      <Bar width={i % 2 ? '29%' : '38%'} height={11} />
      <Bar width="100%" height={i === 1 ? 92 : 43} className={styles.input} />
    </div>)}
    <Bar width="155px" height={40} className={styles.button} />
  </Block>;
}
function Metrics() { return <div className={styles.stats}>{Array.from({ length: 4 }, (_, i) => <SmallCard key={i}/>)}</div>; }
function Billing() {
  return <>
    <Block className={styles.banner}><Bar width="25%" height={12} /><Bar width="55%" height={10} /></Block>
    <div className={styles.billingGrid}>
      <Block className={styles.subscription}><Bar width="48%" height={11} /><Bar width="38%" height={48} /><Bar width="70%" height={11} /><Bar width="55%" height={11} /></Block>
      <Block className={styles.usage}><Bar width="45%" height={19} /><Metrics /></Block>
    </div>
    <div className={styles.prices}>{Array.from({length:3}, (_, i) => <Block className={styles.price} key={i}><Bar width="35%" height={20}/><Bar width="60%" height={36}/><Bar width="78%" height={11}/><div className={styles.cardSpacer}/><Bar width="100%" height={42}/></Block>)}</div>
  </>;
}
function Dashboard() {
  return <>
    <Block className={styles.hero}><Bar width="145px" height={11}/><Bar width="52%" height={31}/><Bar width="38%" height={12}/><Bar width="120px" height={35}/></Block>
    <Metrics /><GridCard count={2} />
  </>;
}
function Telegram() {
  return <>
    <Block className={styles.account}><Bar width="42px" height={42}/><div className={styles.flexOne}><Bar width="40%" height={16}/><Bar width="55%" height={11}/></div><Bar width="115px" height={35}/></Block>
    <div className={styles.twoCol}><Form sections={3} /><Form sections={3} /></div>
    <Block className={styles.actionStrip}><Bar width="36%" height={20}/><Bar width="110px" height={38}/><Bar width="110px" height={38}/></Block>
  </>;
}
function Calendar() {
  return <>
    <Block className={styles.toolbar}><Bar width="120px" height={35}/><Bar width="190px" height={35}/><Bar width="110px" height={35}/></Block>
    <div className={styles.calendarGrid}>
      <Block className={styles.month}><Bar width="33%" height={19}/><div className={styles.monthCells}>{Array.from({length:35},(_,i)=><span className={`${styles.shimmer} ${styles.day}`} key={i} />)}</div></Block>
      <Block className={styles.agenda}><Bar width="55%" height={17}/>{Array.from({length:4},(_,i)=><div className={styles.agendaRow} key={i}><Bar width="30px" height={30}/><Bar width="65%" height={13}/></div>)}</Block>
    </div>
  </>;
}
function Settings() { return <div className={styles.twoCol}><Form sections={3}/><Form sections={4}/></div>; }

export function SectionSkeleton({ variant = 'table' }: { variant?: 'table'|'cards'|'stats'|'form'|'list' }) {
  return <div role="status" aria-label="Chargement des données" aria-busy="true" className={styles.section}>
    <span className={styles.srOnly}>Chargement des données en cours…</span>
    {variant === 'table' || variant === 'list' ? <Table rows={variant === 'list' ? 4 : 6}/> : variant === 'cards' ? <GridCard/> : variant === 'stats' ? <Metrics/> : <Form />}
  </div>;
}

export function PageSkeleton({ variant = 'generic' }: { variant?: SkeletonVariant }) {
  return <div className={styles.page} role="status" aria-busy="true" aria-label="Chargement de la page">
    <span className={styles.srOnly}>Chargement de la page en cours…</span>
    <Heading compact={variant === 'profil'} />
    {variant === 'dashboard' ? <Dashboard />
      : variant === 'annonces' ? <><Metrics/><Block className={styles.toolbar}><Bar width="65%" height={39}/><Bar width="17%" height={39}/><Bar width="12%" height={39}/></Block><GridCard image /></>
      : variant === 'telegram' ? <Telegram />
      : variant === 'groupes' ? <><Block className={styles.toolbar}><Bar width="75%" height={42}/><Bar width="150px" height={42}/></Block><GridCard/></>
      : variant === 'calendrier' ? <Calendar />
      : variant === 'abonnement' ? <Billing />
      : variant === 'profil' || variant === 'settings' ? <Settings />
      : variant === 'historique' || variant === 'table' ? <><Metrics/><Table/></>
      : <><Metrics/><GridCard /></>}
  </div>;
}

export function DashboardLoadingScreen() {
  return <div className={styles.screen} role="status" aria-label="Chargement de Nashra" aria-busy="true">
    <span className={styles.srOnly}>Chargement de votre espace Nashra…</span>
    <aside className={styles.fakeSidebar} aria-hidden="true">
      <Row><Bar width="31px" height={31}/><Bar width="100px" height={25}/></Row>
      <div className={styles.fakePlan}><Bar width="95px" height={11}/><Bar width="65%" height={26}/><Bar width="70%" height={10}/></div>
      {Array.from({length:6},(_,i)=><Row className={styles.fakeNav} key={i}><Bar width="19px" height={19}/><Bar width={i%2?'53%':'67%'} height={13}/></Row>)}
      <div className={styles.fakeUser}><Bar width="34px" height={34}/><div className={styles.flexOne}><Bar width="70%" height={12}/><Bar width="85%" height={10}/></div></div>
    </aside>
    <div className={styles.fakeMain}>
      <div className={styles.fakeTopbar}><Bar width="180px" height={12}/><Bar width="135px" height={23}/></div>
      <div className={styles.fakeContent}><PageSkeleton variant="dashboard"/></div>
    </div>
  </div>;
}

export function AuthLoadingScreen() {
  return <div className={styles.authScreen} role="status" aria-label="Chargement du formulaire" aria-busy="true">
    <span className={styles.srOnly}>Chargement de votre espace de connexion…</span>
    <div className={styles.authPanel}>
      <Row><Bar width="35px" height={35}/><Bar width="110px" height={28}/></Row>
      <div className={styles.authHeading}><Bar width="78%" height={29}/><Bar width="90%" height={11}/></div>
      <div className={styles.authFields}>
        <Bar width="100%" height={48}/><Bar width="32%" height={11}/>
        <Bar width="100%" height={45}/><Bar width="30%" height={11}/>
        <Bar width="100%" height={45}/><Bar width="100%" height={45}/>
      </div>
    </div>
  </div>;
}
