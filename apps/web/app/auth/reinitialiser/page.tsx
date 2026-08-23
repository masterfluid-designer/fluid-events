'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { KeyRound, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';
import Lines from '@/components/Lines';
import { AuthBackLink } from '@/components/auth/back-link';

/**
 * Réinitialisation de mot de passe (2026-08-23).
 *
 * Jumelle de `/auth/set-password`, avec deux différences qui comptent :
 * le jeton vient d'un email de récupération et non d'une invitation, et
 * l'écran nomme l'expiration — un lien mort au bout d'une heure doit
 * s'expliquer, sinon la personne conclut que la plateforme est cassée.
 */
function FormulaireReinitialisation() {
  const parametres = useSearchParams();
  const token = parametres.get('token') ?? '';

  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [reussi, setReussi] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!token) {
      setErreur('Lien de réinitialisation invalide — le jeton est manquant.');
      return;
    }
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les mots de passe ne correspondent pas.');
      return;
    }

    setChargement(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: motDePasse }),
      });
      const corps = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(corps?.error?.message ?? 'Impossible de réinitialiser le mot de passe.');
      }
      setReussi(true);
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
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex size-13 items-center justify-center rounded-full bg-alabaster dark:bg-blackho">
                <KeyRound className="size-6 text-black dark:text-white" />
              </div>
              <h1 className="mb-2 text-2xl font-bold text-black dark:text-white">
                Nouveau mot de passe
              </h1>
              <p className="text-sm">
                Choisissez-en un nouveau : vous retrouverez votre espace exactement comme vous
                l’avez laissé.
              </p>
            </div>

            {/*
              Le lien vaut une heure. Le dire ICI évite qu'un lien expiré passe
              pour une panne de la plateforme.
            */}
            {!token && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Ce lien est incomplet. Les liens de réinitialisation expirent au bout d’une
                  heure —{' '}
                  <Link href="/auth/mot-de-passe-oublie" className="font-semibold underline">
                    demandez-en un nouveau
                  </Link>
                  .
                </span>
              </div>
            )}

            {erreur && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {erreur}{' '}
                  <Link href="/auth/mot-de-passe-oublie" className="font-semibold underline">
                    Demander un nouveau lien
                  </Link>
                </span>
              </div>
            )}

            {reussi ? (
              <div className="text-center">
                <div className="mb-6 flex items-center justify-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Mot de passe réinitialisé.</span>
                </div>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho"
                >
                  Se connecter
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ) : (
              <form onSubmit={soumettre} className="flex flex-col gap-4">
                <input
                  type="password"
                  name="password"
                  placeholder="Nouveau mot de passe"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={!token}
                  className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                />
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Confirmer le mot de passe"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={!token}
                  className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                />
                <button
                  type="submit"
                  disabled={chargement || !token}
                  aria-label="réinitialiser le mot de passe"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho disabled:opacity-60"
                >
                  {chargement ? 'Enregistrement…' : 'Réinitialiser'}
                  <ArrowRight className="size-3.5" />
                </button>
              </form>
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

export default function PageReinitialisation() {
  return (
    <Suspense fallback={null}>
      <FormulaireReinitialisation />
    </Suspense>
  );
}
