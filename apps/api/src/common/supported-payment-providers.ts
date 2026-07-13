import { PaymentProviderType } from '@saas-events/types';

/**
 * Fournisseurs dont l'EXÉCUTION (init paiement + webhook) est réellement
 * branchée — pas seulement configurable par l'Admin. V1 se concentre sur
 * Kkiapay (CDC) ; CinetPay/FedaPay ont désormais une doc technique réunie
 * (voir ROADMAP.md Phase "Payments CinetPay/FedaPay") mais aucune exécution
 * codée. Source unique de vérité, partagée par PaymentsService (init/webhook)
 * et AdminService (empêche d'activer un provider non exécutable).
 */
export const SUPPORTED_PAYMENT_PROVIDERS: PaymentProviderType[] = [PaymentProviderType.KKIAPAY];
