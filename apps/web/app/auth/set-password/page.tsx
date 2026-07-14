"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { KeyRound, ShieldAlert, ArrowRight, CheckCircle2 } from "lucide-react";
import Header from "@/components/Header";
import Lines from "@/components/Lines";

/**
 * Page publique consommant le lien d'invitation Manager (email, CDC §14.3) :
 * pose le mot de passe initial via POST /api/auth/set-password, puis renvoie
 * vers /auth/login. Même gabarit visuel que /auth/login (page publique,
 * non protégée par le layout dashboard).
 */
function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Lien d'invitation invalide — le token est manquant.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/api/auth/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message ?? "Impossible de définir le mot de passe");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="relative overflow-hidden bg-alabaster dark:bg-blackho">
        <Lines />
        <section className="pb-12.5 pt-32.5 lg:pb-25 lg:pt-45 xl:pb-30 xl:pt-50">
          <div className="relative z-1 mx-auto max-w-125 px-4">
            <motion.div
              variants={{
                hidden: { opacity: 0, y: -20 },
                visible: { opacity: 1, y: 0 },
              }}
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
                  Définir votre mot de passe
                </h1>
                <p className="text-sm">
                  Choisissez un mot de passe pour accéder à votre dashboard organisateur.
                </p>
              </div>

              {!token && (
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  <ShieldAlert className="size-4 shrink-0" />
                  <span>Ce lien est invalide. Demandez une nouvelle invitation à votre administrateur.</span>
                </div>
              )}

              {error && (
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  <ShieldAlert className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success ? (
                <div className="text-center">
                  <div className="mb-6 flex items-center justify-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>Mot de passe défini avec succès.</span>
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
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <input
                    type="password"
                    placeholder="Nouveau mot de passe"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                    required
                    minLength={8}
                    disabled={!token}
                  />
                  <input
                    type="password"
                    placeholder="Confirmer le mot de passe"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                    required
                    minLength={8}
                    disabled={!token}
                  />
                  <button
                    type="submit"
                    disabled={loading || !token}
                    aria-label="définir le mot de passe"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho disabled:opacity-60"
                  >
                    {loading ? "Enregistrement..." : "Définir le mot de passe"}
                    <ArrowRight className="size-3.5" />
                  </button>
                </form>
              )}

              <div className="mt-9 border-t border-stroke pt-5 text-center dark:border-strokedark">
                <Link
                  className="text-sm font-semibold text-waterloo hover:text-black dark:text-manatee dark:hover:text-white"
                  href="/"
                >
                  ← Retour à l&apos;accueil
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
    </>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}
