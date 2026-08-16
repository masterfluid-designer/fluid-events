'use client';

import { useEffect, useRef, useState } from 'react';
import { useKKiaPay } from 'kkiapay-react';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { PaymentInitResult } from '@saas-events/types';
import { CHECKOUT_RESUME_EVENT, consumeIntent } from '@/lib/auth';
import { api, apiPost, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CheckoutPhoneDialog } from './checkout-phone-dialog';

/**
 * ResumeCheckout — Reprise du tunnel d'achat après retour d'OAuth (CDC §7.4, §8).
 *
 * Le fournisseur n'est jamais choisi côté client : `POST /api/payments/init`
 * le détermine depuis la config active de l'événement (décision produit
 * 2026-07-13, un seul provider actif par événement). Kkiapay n'a pas de
 * "checkoutUrl" serveur (paiement via widget JS) ; CinetPay/FedaPay renvoient
 * une URL de paiement hébergée — on redirige simplement le navigateur.
 *
 * Dans tous les cas, le webhook backend reste la SEULE source de vérité de
 * confirmation (RULES.md) — ni le callback `success` du widget, ni le retour
 * de redirection, ne déclenchent autre chose qu'un polling de
 * `GET /api/payments/orders/:id`, jamais une confirmation directe.
 */

interface OrderStatus {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
  items: Array<{ id: string; ticketName: string; hasTicket: boolean }>;
}

interface CartItem {
  ticketId: string;
  quantity: number;
}

type FlowState =
  | { step: 'idle' }
  /** Numéro manquant : on le demande avant d’ouvrir le paiement. */
  | { step: 'phone'; items: CartItem[] }
  | { step: 'initializing' }
  | { step: 'awaiting-payment' }
  | { step: 'confirming'; orderId: string }
  | { step: 'success'; order: OrderStatus }
  | { step: 'error'; message: string };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

export function ResumeCheckout({
  slug,
  resume,
  orderId,
}: {
  slug: string;
  resume: boolean;
  /** Présent au retour d'une redirection CinetPay/FedaPay — reprend directement le polling. */
  orderId?: string;
}) {
  const { openKkiapayWidget, addSuccessListener, addFailedListener, removeKkiapayListener } =
    useKKiaPay();
  const [state, setState] = useState<FlowState>({ step: 'idle' });
  const startedRef = useRef(false);
  /**
   * Identité de l’acheteur, pour pré-remplir le widget Kkiapay (les deux
   * autres providers sont pré-remplis côté serveur, leurs pages étant
   * hébergées). Un `ref` et non un `state` : sa mise à jour ne doit jamais
   * provoquer de rendu au milieu de l’ouverture du widget.
   */
  const buyerRef = useRef<{ name: string | null; email: string; phone: string | null } | null>(null);

  /**
   * Point d’entrée du tunnel après authentification : on réclame le numéro
   * de l’acheteur s’il n’en a pas encore, sinon on va droit au paiement — un
   * client qui rachète ne resaisit jamais son numéro.
   */
  async function startCheckout(items: CartItem[]) {
    setState({ step: 'initializing' });
    try {
      const me = await api<{ name: string | null; email: string; phone: string | null }>(
        '/api/auth/me',
      );
      buyerRef.current = me;
      if (!me.phone) {
        setState({ step: 'phone', items });
        return;
      }
    } catch {
      // Le numéro ne sert qu’au pré-remplissage et à joindre l’acheteur : si
      // `/api/auth/me` échoue, on laisse le paiement suivre son cours plutôt
      // que de bloquer une vente. L’API reste seule garante de l’accès.
    }
    await initPayment(items);
  }

  async function initPayment(items: CartItem[]) {
    setState({ step: 'initializing' });
    try {
      const init = await apiPost<PaymentInitResult>('/api/payments/init', { items });

      if (init.provider === 'KKIAPAY') {
        setState({ step: 'awaiting-payment' });
        openKkiapayWidget({
          amount: init.amount,
          key: init.publicKey,
          sandbox: init.sandbox,
          partnerId: init.partnerId,
          data: init.partnerId,
          // Pré-remplissage (décision produit 2026-08-16) : l’acheteur n’a plus
          // qu’à confirmer. Champs omis quand inconnus — une chaîne vide
          // afficherait un champ « rempli » mais invalide.
          ...(buyerRef.current?.email ? { email: buyerRef.current.email } : {}),
          ...(buyerRef.current?.phone ? { phone: buyerRef.current.phone } : {}),
          ...(buyerRef.current?.name ? { name: buyerRef.current.name } : {}),
        });
        return;
      }

      // CinetPay/FedaPay : pas de widget, redirection vers la page de
      // paiement hébergée par le provider — le webhook confirmera ensuite.
      setState({ step: 'awaiting-payment' });
      window.location.href = init.checkoutUrl;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Impossible de démarrer le paiement.';
      setState({ step: 'error', message });
      toast.error(message);
    }
  }

  // Reprise après retour d'une redirection CinetPay/FedaPay : l'Order existe
  // déjà (créé à l'init), on saute directement au polling — jamais de
  // confirmation basée sur le seul retour de redirection (RULES.md).
  useEffect(() => {
    if (!orderId || startedRef.current) return;
    startedRef.current = true;
    setState({ step: 'confirming', orderId });
  }, [orderId]);

  // Reprise de l'intent sauvegardé avant l'OAuth (une seule fois au montage,
  // flux widget Kkiapay uniquement — un `orderId` déjà connu prend le dessus).
  useEffect(() => {
    if (!resume || orderId || startedRef.current) return;
    startedRef.current = true;
    const intent = consumeIntent(slug);
    if (!intent) {
      setState({
        step: 'error',
        message: "Votre session d'achat a expiré, veuillez réessayer.",
      });
      return;
    }
    void startCheckout(intent.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, slug, orderId]);

  // Reprise après une authentification en POP-UP (le cas courant désormais) :
  // l'onglet n'a pas été rechargé, donc aucun `?resume=1` ne passera — c'est
  // le sélecteur de billets qui émet l'événement une fois la pop-up refermée
  // avec succès. `startedRef` n'est volontairement PAS utilisé ici : le
  // visiteur doit pouvoir relancer un achat sans recharger la page.
  useEffect(() => {
    function onResume() {
      const intent = consumeIntent(slug);
      if (!intent) {
        setState({
          step: 'error',
          message: "Votre session d'achat a expiré, veuillez réessayer.",
        });
        return;
      }
      void startCheckout(intent.items);
    }
    window.addEventListener(CHECKOUT_RESUME_EVENT, onResume);
    return () => window.removeEventListener(CHECKOUT_RESUME_EVENT, onResume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Écoute des callbacks du widget Kkiapay — enregistrés une seule fois.
  useEffect(() => {
    const onSuccess = (data: { partnerId?: string }) => {
      const orderId = data?.partnerId;
      if (!orderId) return;
      setState({ step: 'confirming', orderId });
    };
    const onFailed = () => {
      setState({ step: 'error', message: 'Le paiement a échoué ou a été annulé.' });
    };
    addSuccessListener(onSuccess);
    addFailedListener(onFailed);
    return () => {
      removeKkiapayListener('success');
      removeKkiapayListener('failed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling du statut réel de la commande (webhook = seule source de vérité).
  useEffect(() => {
    if (state.step !== 'confirming') return;
    const { orderId } = state;
    const startedAt = Date.now();

    const interval = setInterval(async () => {
      try {
        const order = await api<OrderStatus>(`/api/payments/orders/${orderId}`);
        if (order.status === 'PAID') {
          clearInterval(interval);
          setState({ step: 'success', order });
        } else if (order.status === 'FAILED') {
          clearInterval(interval);
          setState({
            step: 'error',
            message:
              "Le paiement n'a pas pu être confirmé. Aucun billet n'a été généré.",
          });
        } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          clearInterval(interval);
          setState({
            step: 'error',
            message:
              'La confirmation prend plus de temps que prévu. Vérifiez votre email dans quelques minutes.',
          });
        }
      } catch {
        // Erreur réseau ponctuelle — on retente au prochain tick.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [state]);

  if (state.step === 'idle') return null;

  if (state.step === 'phone') {
    const { items } = state;
    return (
      <CheckoutPhoneDialog
        onSaved={(phone) => {
          if (buyerRef.current) buyerRef.current.phone = phone;
          void initPayment(items);
        }}
        onCancel={() => setState({ step: 'idle' })}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-stroke bg-white p-6 text-center shadow-solid-2 dark:border-strokedark dark:bg-blacksection">
        {(state.step === 'initializing' ||
          state.step === 'awaiting-payment' ||
          state.step === 'confirming') && (
          <>
            <Spinner className="mx-auto size-8" />
            <p className="mt-4 text-sm text-manatee dark:text-waterloo">
              {state.step === 'initializing' && 'Préparation du paiement...'}
              {state.step === 'awaiting-payment' &&
                'Finalisez votre paiement...'}
              {state.step === 'confirming' && 'Confirmation du paiement en cours...'}
            </p>
          </>
        )}
        {state.step === 'success' && (
          <>
            <CheckCircle2 className="mx-auto size-10 text-green-600" />
            <h2 className="mt-3 font-event text-lg">Paiement confirmé !</h2>
            <p className="mt-2 text-sm text-manatee dark:text-waterloo">
              Vos billets sont en cours de génération. Vous les recevrez par email.
            </p>
            <Button className="mt-5 w-full rounded-full" onClick={() => setState({ step: 'idle' })}>
              Fermer
            </Button>
          </>
        )}
        {state.step === 'error' && (
          <>
            <XCircle className="mx-auto size-10 text-destructive" />
            <h2 className="mt-3 font-event text-lg">Un problème est survenu</h2>
            <p className="mt-2 text-sm text-manatee dark:text-waterloo">{state.message}</p>
            <Button
              variant="outline"
              className="mt-5 w-full rounded-full"
              onClick={() => setState({ step: 'idle' })}
            >
              Fermer
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
