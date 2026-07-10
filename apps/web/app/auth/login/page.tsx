"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Mail, ShieldAlert, Ticket } from "lucide-react";
import Header from "@/components/Header";
import Lines from "@/components/Lines";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
  const [scannerMode, setScannerMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleGoogleLogin() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    const params = new URLSearchParams({ redirect: redirectTo });
    window.location.href = `${apiBase}/api/auth/google?${params.toString()}`;
  }

  async function handleScannerLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/api/auth/scanner/login`, {
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
      <Header />
      <main className="relative overflow-hidden bg-alabaster dark:bg-black">
        <Lines />
        <section className="pb-12.5 pt-32.5 lg:pb-25 lg:pt-45 xl:pb-30 xl:pt-50">
          <div className="relative z-1 mx-auto max-w-c-1016 px-7.5 pb-7.5 pt-10 lg:px-15 lg:pt-15 xl:px-20 xl:pt-20">
            <div className="absolute left-0 top-0 -z-1 h-2/3 w-full rounded-lg bg-linear-to-t from-transparent to-[#dee7ff47] dark:bg-linear-to-t dark:to-[#252A42]" />
            <div className="absolute bottom-17.5 left-0 -z-1 h-1/3 w-full">
              <Image
                src="/images/shape/shape-dotted-light.svg"
                alt=""
                className="dark:hidden"
                fill
              />
              <Image
                src="/images/shape/shape-dotted-dark.svg"
                alt=""
                className="hidden dark:block"
                fill
              />
            </div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: -20 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              transition={{ duration: 1, delay: 0.1 }}
              viewport={{ once: true }}
              className="animate_top rounded-lg bg-white px-7.5 pt-7.5 shadow-solid-8 dark:border dark:border-strokedark dark:bg-black xl:px-15 xl:pt-15"
            >
              <div className="mb-10 text-center">
                <div className="mx-auto mb-5 flex size-15 items-center justify-center rounded-full bg-zumthor text-primary dark:bg-blacksection">
                  <Ticket className="size-7" />
                </div>
                <h1 className="mb-3 text-3xl font-semibold text-black dark:text-white xl:text-sectiontitle2">
                  {scannerMode ? "Connexion scanner" : "Connexion à Fluid Events"}
                </h1>
                <p>
                  {scannerMode
                    ? "Accédez au contrôle d'entrée de votre événement."
                    : "Connectez-vous pour acheter, organiser ou gérer vos événements."}
                </p>
              </div>

              {error && (
                <div className="mb-7.5 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  <ShieldAlert className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!scannerMode ? (
                <div className="pb-10">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    aria-label="continuer avec google"
                    className="mb-6 flex w-full items-center justify-center rounded-xs border border-stroke bg-[#f8f8f8] px-6 py-3 text-base text-black outline-hidden transition-all duration-300 hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-transparent dark:bg-[#2C303B] dark:text-white dark:hover:border-primary"
                  >
                    <Mail className="mr-3 size-5" />
                    Continuer avec Google
                  </button>

                  <div className="mb-10 flex items-center justify-center">
                    <span className="hidden h-[1px] w-full max-w-[200px] bg-stroke dark:bg-strokedark sm:block" />
                    <p className="w-full px-5 text-center text-base">
                      ou utilisez l'accès scanner dédié
                    </p>
                    <span className="hidden h-[1px] w-full max-w-[200px] bg-stroke dark:bg-strokedark sm:block" />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setScannerMode(true);
                      setError(null);
                    }}
                    className="inline-flex items-center gap-2.5 rounded-full bg-black px-6 py-3 font-medium text-white duration-300 ease-in-out hover:bg-blackho dark:bg-btndark"
                  >
                    Connexion scanner
                    <svg className="fill-white" width="14" height="14" viewBox="0 0 14 14">
                      <path d="M10.4767 6.16664L6.00668 1.69664L7.18501 0.518311L13.6667 6.99998L7.18501 13.4816L6.00668 12.3033L10.4767 7.83331H0.333344V6.16664H10.4767Z" />
                    </svg>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleScannerLogin}>
                  <div className="mb-7.5 flex flex-col gap-7.5 lg:mb-12.5 lg:flex-row lg:justify-between lg:gap-14">
                    <input
                      type="email"
                      placeholder="Email scanner"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border-b border-stroke bg-white! pb-3.5 focus:border-waterloo focus:placeholder:text-black focus-visible:outline-hidden dark:border-strokedark dark:bg-black! dark:focus:border-manatee dark:focus:placeholder:text-white lg:w-1/2"
                      required
                    />
                    <input
                      type="password"
                      placeholder="Mot de passe"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full border-b border-stroke bg-white! pb-3.5 focus:border-waterloo focus:placeholder:text-black focus-visible:outline-hidden dark:border-strokedark dark:bg-black! dark:focus:border-manatee dark:focus:placeholder:text-white lg:w-1/2"
                      required
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-10 md:justify-between xl:gap-15">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerMode(false);
                        setError(null);
                      }}
                      className="hover:text-primary"
                    >
                      Connexion organisateur / client
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      aria-label="login scanner"
                      className="inline-flex items-center gap-2.5 rounded-full bg-black px-6 py-3 font-medium text-white duration-300 ease-in-out hover:bg-blackho disabled:opacity-60 dark:bg-btndark dark:hover:bg-blackho"
                    >
                      {loading ? "Connexion..." : "Se connecter"}
                      <svg className="fill-white" width="14" height="14" viewBox="0 0 14 14">
                        <path d="M10.4767 6.16664L6.00668 1.69664L7.18501 0.518311L13.6667 6.99998L7.18501 13.4816L6.00668 12.3033L10.4767 7.83331H0.333344V6.16664H10.4767Z" />
                      </svg>
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-12.5 border-t border-stroke py-5 text-center dark:border-strokedark">
                <p>
                  <Link
                    className="text-black hover:text-primary dark:text-white dark:hover:text-primary"
                    href="/"
                  >
                    Retour à l'accueil
                  </Link>
                </p>
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
