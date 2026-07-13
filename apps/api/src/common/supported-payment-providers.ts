import { PaymentProviderType } from '@saas-events/types';

/**
 * Fournisseurs dont l'EXÉCUTION (init paiement + webhook) est réellement
 * branchée — pas seulement configurable par l'Admin. Les trois providers du
 * CDC sont exécutables depuis le 2026-07-13 (voir ROADMAP.md §2 pour les
 * détails d'implémentation CinetPay/FedaPay). Source unique de vérité,
 * partagée par PaymentsService (init/webhook) et AdminService (empêche
 * d'activer un provider non exécutable, si jamais ce tableau redevient un
 * sous-ensemble à l'avenir).
 */
export const SUPPORTED_PAYMENT_PROVIDERS: PaymentProviderType[] = [
  PaymentProviderType.KKIAPAY,
  PaymentProviderType.CINETPAY,
  PaymentProviderType.FEDAPAY,
];
