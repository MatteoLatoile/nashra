import Image from 'next/image';
import styles from './billing-flow-loader.module.css';

export type BillingFlowStep = 'selection' | 'authentication' | 'payment';

const flowSteps = [
  { key: 'selection', label: 'Votre offre' },
  { key: 'authentication', label: 'Connexion' },
  { key: 'payment', label: 'Paiement' },
] as const;

const titles: Record<BillingFlowStep, string> = {
  selection: 'Préparation de votre offre…',
  authentication: 'Connexion à votre espace…',
  payment: 'Ouverture du paiement sécurisé…',
};

const subtitles: Record<BillingFlowStep, string> = {
  selection: 'Nous conservons votre sélection pour la suite.',
  authentication: 'Votre abonnement sera prêt après votre connexion.',
  payment: 'Vous allez être redirigé vers Stripe.',
};

/** Visuel uniquement : n'introduit aucun délai artificiel ni nouvelle requête. */
export function BillingFlowLoader({
  step,
  title,
  subtitle,
  offer,
}: {
  step: BillingFlowStep;
  title?: string;
  subtitle?: string;
  offer?: string;
}) {
  const active = flowSteps.findIndex((item) => item.key === step);

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}><Image src="/nashra-mark.png" width={27} height={27} alt="" /></span>
          <strong>nashra<span className={styles.period}>.</span></strong>
        </div>
        <div className={styles.spinner} aria-hidden="true"><span /></div>
        {offer && <div className={styles.offer}>{offer}</div>}
        <h2 className={styles.title}>{title || titles[step]}</h2>
        <p className={styles.subtitle}>{subtitle || subtitles[step]}</p>
        <ol className={styles.steps} aria-label="Étapes de souscription">
          {flowSteps.map((item, index) => (
            <li key={item.key} className={index < active ? styles.complete : index === active ? styles.active : styles.upcoming} aria-current={index === active ? 'step' : undefined}>
              <span className={styles.number}>{index < active ? '✓' : index + 1}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
        <p className={styles.note}>Cette étape ne déclenche aucun paiement.</p>
      </div>
    </div>
  );
}
