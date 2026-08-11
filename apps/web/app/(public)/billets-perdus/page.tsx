'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { apiPost, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

/**
 * "J'ai perdu mes billets" — récupération en libre-service (numéro de
 * commande + email), sans connexion. POST /api/tickets/recover renvoie
 * toujours un succès identique (pas d'énumération de commandes) : le message
 * de confirmation est donc générique, jamais "commande introuvable".
 */
export default function LostTicketsPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const recover = useMutation({
    mutationFn: () => apiPost('/api/tickets/recover', { orderNumber: orderNumber.trim(), email: email.trim() }),
    onSuccess: () => setSent(true),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Une erreur est survenue — réessayez.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    recover.mutate();
  }

  return (
    <main className="min-h-svh bg-alabaster dark:bg-blackho">
      <div className="mx-auto max-w-md px-4 py-12 md:px-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-manatee hover:text-black dark:text-waterloo dark:hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Retour à l'accueil
        </Link>

        <div className="rounded-2xl border border-stroke bg-white p-7 shadow-solid-2 dark:border-strokedark dark:bg-blacksection">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <MailCheck className="size-10 text-accent-terracotta dark:text-accent-terracotta-dark" />
              <h1 className="font-serif text-lg font-semibold">Vérifiez votre boîte mail</h1>
              <p className="text-sm text-waterloo dark:text-manatee">
                Si une commande correspond, vos billets viennent de vous être renvoyés par email.
              </p>
              <Button variant="outline" className="mt-2" onClick={() => setSent(false)}>
                Réessayer avec une autre commande
              </Button>
            </div>
          ) : (
            <>
              <h1 className="font-serif text-xl font-semibold">J'ai perdu mes billets</h1>
              <p className="mt-1.5 text-sm text-waterloo dark:text-manatee">
                Renseignez votre numéro de commande et l'email utilisé à l'achat — vos billets vous
                seront renvoyés par email.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  Numéro de commande
                  <input
                    required
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="ex : ckx1a2b3c4d5"
                    className="rounded-lg border border-stroke bg-transparent px-3.5 py-2.5 text-sm focus:border-black focus-visible:outline-none dark:border-strokedark dark:focus:border-white"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Email utilisé à l'achat
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    className="rounded-lg border border-stroke bg-transparent px-3.5 py-2.5 text-sm focus:border-black focus-visible:outline-none dark:border-strokedark dark:focus:border-white"
                  />
                </label>
                <Button type="submit" disabled={recover.isPending} className="mt-1">
                  {recover.isPending ? 'Envoi...' : 'Récupérer mes billets'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
