import { BillingFlowLoader } from '@/components/billing-flow-loader';

export default function AbonnementLoading() {
  return <BillingFlowLoader step="payment" title="Chargement de votre abonnement…" subtitle="Nous vérifions vos informations de facturation." />;
}
