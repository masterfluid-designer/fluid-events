"use client";

import { AuthBackLink } from '@/components/auth/back-link';
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Mail, ShieldAlert, Ticket, ArrowRight } from "lucide-react";
import Lines from "@/components/Lines";
import { BrandIcon } from "@/components/brand/brand-logo";

function LoginForm() {
  const searchParams = useSearchParams();
  // Distinguer « cible explicitement demandée » de « aucune cible » : sans
  // cette distinction on envoyait `redirect=/` au backend, qui l'honorait et
  // ramenait tout le monde sur la page d'accueil — y compris un Admin, qui
  // n'atteignait donc jamais son tableau de bord.
  const explicitRedirect = searchParams.get("redirect");
  const redirectTo = explicitRedirect ?? "/";
  const [scannerMode, setScannerMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleGoogleLogin() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    // Sans cible explicite, on n'envoie PAS de `redirect` : le backend
    // retombe alors sur /auth/callback, qui oriente selon le rôle.
    const query = explicitRedirect
      ? `?${new URLSearchParams({ redirect: explicitRedirect })}`
      : "";
    window.location.href = `${apiBase}/api/auth/google${query}`;
  }

  /** Login email/password simple — comptes de test CLIENT/MANAGER/SUPER_ADMIN. */
  async function handleSimpleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message ?? "Connexion échouée");
      }
      const destinations: Record<string, string> = {
        SUPER_ADMIN: "/admin",
        MANAGER: "/manager",
        CLIENT: redirectTo,
      };
      window.location.href = destinations[body?.data?.role] ?? redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleScannerLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/api/auth/login/scanner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Connexion échouée");
      }
      window.location.href = "/scanner/scan";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Pas de header ni de footer sur les écrans d'authentification : rien
          ne doit détourner de l'action en cours. Le padding haut d'origine
          (pt-32.5) ne servait qu'à dégager le header fixe — il laisserait un
          grand vide maintenant, d'où le centrage vertical. */}
      <main className="relative flex min-h-svh items-center overflow-hidden">
        <Lines />
        <section className="w-full py-12">
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
                  <BrandIcon
                    className="size-6"
                    fallback={<Ticket className="size-6 text-black dark:text-white" />}
                  />
                </div>
                <h1 className="mb-2 text-2xl font-bold text-black dark:text-white">
                  {scannerMode ? "Connexion scanner" : "Connexion à Fluid Events"}
                </h1>
                <p className="text-sm">
                  {scannerMode
                    ? "Accédez au contrôle d'entrée de votre événement."
                    : "Connectez-vous pour acheter, organiser ou gérer vos événements."}
                </p>
              </div>

              {error && (
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  <ShieldAlert className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!scannerMode ? (
                <div>
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    aria-label="continuer avec google"
                    className="mb-6 flex w-full items-center justify-center gap-2.5 rounded-full border border-stroke bg-secondary px-6 py-3.5 text-sm font-semibold text-black transition-all duration-300 hover:bg-alabaster dark:border-strokedark dark:bg-blackho dark:text-white dark:hover:bg-hoverdark"
                  >
                    <Mail className="size-4.5" />
                    Continuer avec Google
                  </button>

                  <div className="mb-6 flex items-center gap-3.5">
                    <span className="h-px flex-1 bg-stroke dark:bg-strokedark" />
                    <p className="text-xs text-waterloo dark:text-manatee">
                      ou avec email et mot de passe
                    </p>
                    <span className="h-px flex-1 bg-stroke dark:bg-strokedark" />
                  </div>

                  <form
                    onSubmit={handleSimpleLogin}
                    className="mb-6 flex flex-col gap-4"
                  >
                    <input
                      type="email"
                      placeholder="Email"
                      name="loginEmail"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                      required
                    />
                    <input
                      type="password"
                      placeholder="Mot de passe"
                      name="loginPassword"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                      required
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      aria-label="se connecter"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho disabled:opacity-60"
                    >
                      {loading ? "Connexion..." : "Se connecter"}
                      <ArrowRight className="size-3.5" />
                    </button>
                  </form>

                  <div className="mb-6 flex items-center gap-3.5">
                    <span className="h-px flex-1 bg-stroke dark:bg-strokedark" />
                    <p className="text-xs text-waterloo dark:text-manatee">
                      ou accès scanner dédié
                    </p>
                    <span className="h-px flex-1 bg-stroke dark:bg-strokedark" />
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerMode(true);
                        setError(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho dark:hover:bg-hoverdark"
                    >
                      Connexion scanner
                      <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleScannerLogin} className="flex flex-col gap-5">
                  <input
                    type="email"
                    placeholder="Email scanner"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Mot de passe"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-white px-4 py-3 text-sm focus:border-black focus-visible:outline-hidden dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee"
                    required
                  />

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerMode(false);
                        setError(null);
                      }}
                      className="text-sm font-medium text-waterloo hover:text-black dark:text-manatee dark:hover:text-white"
                    >
                      Connexion organisateur / client
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      aria-label="login scanner"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground duration-300 ease-in-out hover:bg-primaryho disabled:opacity-60"
                    >
                      {loading ? "Connexion..." : "Se connecter"}
                      <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-9 border-t border-stroke pt-5 text-center dark:border-strokedark">
                <AuthBackLink className="text-sm font-semibold text-waterloo hover:text-black dark:text-manatee dark:hover:text-white" />
              </div>
            </motion.div>
          </div>
        </section>
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}