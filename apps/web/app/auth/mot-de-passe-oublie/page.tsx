'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MailQuestion, ShieldAlert, ArrowRight, MailCheck } from 'lucide-react';
import Lines from '@/components/Lines';
import { AuthBackLink } from '@/components/auth/back-link';

/**
 * Demande de réinitialisation de mot de passe (2026-08-23).
 *
 * ⚠️ **L'écran de confirmation ne dit pas si le compte existe** — il dit
 * « si un compte utilise cette adresse ». Le serveur répond déjà la même chose
 * dans les deux cas ; annoncer ici « email envoyé » comme un fait rendrait au
 * visiteur l'oracle qu'on vient de lui retirer, et ferait de ce formulaire
 * l'annuaire des organisateurs de la plateforme.
 *
 * Même gabarit visuel que `/auth/set-password` : ces trois écrans
 * (connexion, invitation, récupération) sont le même moment pour l'utilisateur.
 */
export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const corps = await res.json().catch(() => null);
        throw new Error(corps?.error?.message ?? 'La demande n’a pas abouti.');
      }
      setEnvoye(true);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setChargement(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center overflow-hidden">
      <Lines />
      <section className="w-full py-12">
        <div className="relative z-1 mx-auto max-w-125 px-4">
          <motion.div
            variants={{ hidden: { opacity: 0, y: -20 }, visible: { opacity: 1, y: 0 } }}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 1, delay: 0.1 }}
            viewport={{ once: true }}
            className="animate_top rounded-2xl border border-stroke bg-white p-10 shadow-solid-2 dark:border-strokedark dark:bg-blacksection"
          >
            {envoye ? (
              <div className="text-center">
                <div className="mx-auto mb-5 flex size-13 items-center justify-center rounded-full bg-alabaster dark:bg-blackho">
                  <MailCheck className="size-6 text-black dark:text-white" />
                </div>
                <h1 className="mb-2 text-2xl font-bold text-black dark:text-white">
                  Regardez vos emails
                </h1>
                {/*
                  « Si un compte utilise cette adresse » : la formulation est le
                  garde-fou. Un « email envoyé » affirmatif confirmerait
                  l'existence du compte à qui teste des adresses au hasard.
                */}
                <p className="text-sm">
                  Si un compte utilise <strong>{email}</strong>, un lien de réinitialisation
                  vient d’y être envoyé. Il est valable une heure et ne fonctionne qu’une fois.
                </p>
                <p className="mt-4 text-sm text-waterloo dark:text-manatee">
                  Rien reçu au bout de quelques minutes ? Vérifiez vos indésirables, puis
                  réessayez.
                </p>
                <Link
                  href="/auth/login"
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho"
                >
                  Retour à la connexion
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-5 flex size-13 items-center justify-center rounded-full bg-alabaster dark:bg-blackho">
                    <MailQuestion className="size-6 text-black dark:text-white" />
                  </div>
                  <h1 className="mb-2 text-2xl font-bold text-black dark:text-white">
                    Mot de passe oublié
                  </h1>
                  <p className="text-sm">
                    Indiquez l’adresse de votre compte : nous vous enverrons un lien pour en
                    choisir un nouveau.
                  </p>
                </div>

                {erreur && (
                  <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>{erreur}</span>
                  </div>
                )}

                <form onSubmit={soumettre} className="flex flex-col gap-4">
                  <input
                    type="email"
                    name="email"
                    placeholder="Adresse email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                  />
                  <button
                    type="submit"
                    disabled={chargement}
                    aria-label="envoyer le lien de réinitialisation"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho disabled:opacity-60"
                  >
                    {chargement ? 'Envoi…' : 'Envoyer le lien'}
                    <ArrowRight className="size-3.5" />
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-waterloo dark:text-manatee">
                  Vous vous connectez avec Google ? Revenez à la{' '}
                  <Link href="/auth/login" className="font-semibold hover:text-black dark:hover:text-white">
                    page de connexion
                  </Link>
                  .
                </p>
              </>
            )}

            <div className="mt-9 border-t border-stroke pt-5 text-center dark:border-strokedark">
              <AuthBackLink className="text-sm font-semibold text-waterloo hover:text-black dark:text-manatee dark:hover:text-white" />
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
