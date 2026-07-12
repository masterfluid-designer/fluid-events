'use client';

import { useEffect, useRef, useState } from 'react';
import { useKKiaPay } from 'kkiapay-react';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle } from 'lucide-react';
import { consumeIntent } from '@/lib/auth';
import { api, apiPost, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * ResumeCheckout — Reprise du tunnel d'achat après retour d'OAuth (CDC §7.4, §8).
 *
 * Kkiapay n'a pas de "checkoutUrl" serveur : le paiement s'initie via son
 * widget JS côté client. Le webhook backend reste la SEULE source de vérité
 * de confirmation (RULES.md) — le callback `success` du widget ne fait que
 * déclencher un polling de `GET /api/payments/orders/:id`, jamais une
 * confirmation directe.
 */

interface KkiapayInitResult {
  provider: 'KKIAPAY';
  orderId: string;
  partnerId: string;
  amount: number;
  currency: string;
  publicKey: string;
  sandbox: boolean;
}

interface OrderStatus {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
  items: Array<{ id: string; ticketName: string; hasTicket: boolean }>;
}

type FlowState =
  | { step: 'idle' }
  | { step: 'initializing' }
  | { step: 'awaiting-payment' }
  | { step: 'confirming'; orderId: string }
  | { step: 'success'; order: OrderStatus }
  | { step: 'error'; message: string };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

export function ResumeCheckout({ slug, resume }: { slug: string; resume: boolean }) {
  const { openKkiapayWidget, addSuccessListener, addFailedListener, removeKkiapayListener } =
    useKKiaPay();
  const [state, setState] = useState<FlowState>({ step: 'idle' });
  const startedRef = useRef(false);

  async function startCheckout(ticketId: string) {
    setState({ step: 'initializing' });
    try {
      const init = await apiPost<KkiapayInitResult>('/api/payments/init', {
        ticketId,
        provider: 'KKIAPAY',
      });
      setState({ step: 'awaiting-payment' });
      openKkiapayWidget({
        amount: init.amount,
        key: init.publicKey,
        sandbox: init.sandbox,
        partnerId: init.partnerId,
        data: init.partnerId,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Impossible de démarrer le paiement.';
      setState({ step: 'error', message });
      toast.error(message);
    }
  }

  // Reprise de l'intent sauvegardé avant l'OAuth (une seule fois au montage).
  useEffect(() => {
    if (!resume || startedRef.current) return;
    startedRef.current = true;
    const intent = consumeIntent(slug);
    if (!intent) {
      setState({
        step: 'error',
        message: "Votre session d'achat a expiré, veuillez réessayer.",
      });
      return;
    }
    void startCheckout(intent.ticketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, slug]);

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
                'Finalisez votre paiement dans la fenêtre Kkiapay.'}
              {state.step === 'confirming' && 'Confirmation du paiement en cours...'}
            </p>
          </>
        )}
        {state.step === 'success' && (
          <>
            <CheckCircle2 className="mx-auto size-10 text-green-600" />
            <h2 className="mt-3 font-serif text-lg">Paiement confirmé !</h2>
            <p className="mt-2 text-sm text-manatee dark:text-waterloo">
              Vos billets sont en cours de génération. Vous les recevrez par email.
            </p>
            <Button className="mt-5 w-full" onClick={() => setState({ step: 'idle' })}>
              Fermer
            </Button>
          </>
        )}
        {state.step === 'error' && (
          <>
            <XCircle className="mx-auto size-10 text-destructive" />
            <h2 className="mt-3 font-serif text-lg">Un problème est survenu</h2>
            <p className="mt-2 text-sm text-manatee dark:text-waterloo">{state.message}</p>
            <Button
              variant="outline"
              className="mt-5 w-full"
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
