import { BillingFlowLoader } from '@/components/billing-flow-loader';

export default function ConnexionLoading() {
  return <BillingFlowLoader step="authentication" title="Vérification de votre connexion…" />;
}
