"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-35 md:pt-40 xl:pb-25 xl:pt-46">
      <div className="mx-auto max-w-c-1390 px-4 md:px-8 2xl:px-0">
        <motion.div
          variants={{
            hidden: { opacity: 0, y: -20 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mx-auto max-w-c-1016 text-center"
        >
          <span className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-stroke bg-white px-4.5 py-1.5 text-metatitle font-medium text-black shadow-solid-2 dark:border-strokedark dark:bg-blacksection dark:text-white">
            <Sparkles className="size-4 text-primary" />
            Plateforme événementielle africaine
          </span>

          <h1 className="mx-auto mb-5 max-w-[900px] text-4xl font-bold leading-tight text-black dark:text-white md:text-5xl xl:text-hero">
            Créez des événements, vendez vos billets et{" "}
            <span className="relative z-1 inline-block before:absolute before:bottom-2.5 before:left-0 before:-z-1 before:h-3 before:w-full before:bg-titlebg dark:before:bg-titlebgdark">
              scannez les entrées.
            </span>
          </h1>

          <p className="mx-auto max-w-[720px] text-regular text-waterloo dark:text-manatee">
            Fluid Events réunit billetterie, paiements Mobile Money, pages
            événement no-code, QR codes sécurisés et scanner PWA pour organiser
            sans friction.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/login"
              className="group inline-flex items-center gap-2.5 rounded-full bg-black px-8 py-3 text-white duration-300 ease-in-out hover:bg-blackho dark:bg-btndark dark:hover:bg-blackho"
            >
              Commencer gratuitement
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/scanner"
              className="inline-flex items-center gap-2.5 rounded-full border border-stroke bg-white px-8 py-3 text-black duration-300 ease-in-out hover:border-primary hover:text-primary dark:border-strokedark dark:bg-blacksection dark:text-white dark:hover:border-primary dark:hover:text-primary"
            >
              Voir le scanner
            </Link>
          </div>

          <p className="mt-5 text-metatitle text-manatee dark:text-waterloo">
            Pas de carte bancaire requise. Encaissement Mobile Money dès le
            premier événement.
          </p>
        </motion.div>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: 35 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          animate="visible"
          transition={{ duration: 1, delay: 0.35 }}
          className="animate_top relative mx-auto mt-15 max-w-c-1154"
        >
          <Image
            src="/images/shape/shape-01.png"
            alt=""
            width={46}
            height={246}
            className="absolute -left-8 top-8 hidden md:block"
          />
          <Image
            src="/images/shape/shape-02.svg"
            alt=""
            width={37}
            height={37}
            className="absolute -right-5 bottom-12 z-10"
          />
          <Image
            src="/images/shape/shape-03.svg"
            alt=""
            width={22}
            height={22}
            className="absolute -right-9 bottom-9 z-1"
          />

          <div className="relative overflow-hidden rounded-lg border border-stroke bg-white p-2 shadow-solid-l dark:border-strokedark dark:bg-blacksection">
            <div className="flex items-center gap-2 border-b border-stroke px-4 py-3 dark:border-strokedark">
              <span className="size-3 rounded-full bg-[#FF5F57]" />
              <span className="size-3 rounded-full bg-[#FFBD2E]" />
              <span className="size-3 rounded-full bg-[#28C840]" />
              <span className="ml-3 text-metatitle font-medium text-waterloo dark:text-manatee">
                Vidéo autoplay - aperçu Fluid Events
              </span>
            </div>

            <div className="relative aspect-[16/9] overflow-hidden rounded-b-md bg-zumthor dark:bg-black">
              <video
                autoPlay
                muted
                loop
                playsInline
                poster="/images/hero/hero-light.svg"
                aria-label="Démonstration autoplay du dashboard Fluid Events"
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
              />
              <video
                autoPlay
                muted
                loop
                playsInline
                poster="/images/hero/hero-dark.svg"
                aria-label="Démonstration autoplay du dashboard Fluid Events"
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
              />

              <div className="absolute inset-0 bg-linear-to-t from-black/10 via-transparent to-white/10 dark:from-black/40 dark:to-transparent" />
              <motion.div
                aria-hidden="true"
                animate={{ x: ["-15%", "115%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 h-full w-1/5 bg-linear-to-r from-transparent via-primary/15 to-transparent"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex size-17.5 items-center justify-center rounded-full bg-white/90 text-primary shadow-solid-7 backdrop-blur dark:bg-blacksection/90">
                  <Play className="ml-1 size-7 fill-current" />
                </div>
              </div>
              <div className="absolute bottom-5 left-5 right-5 flex items-center gap-3 rounded-full bg-white/85 px-4 py-2 shadow-solid-2 backdrop-blur dark:bg-blacksection/85">
                <span className="size-2.5 rounded-full bg-meta" />
                <span className="text-metatitle font-medium text-black dark:text-white">
                  Paiement confirmé
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-stroke dark:bg-strokedark">
                  <motion.div
                    animate={{ width: ["18%", "92%", "18%"] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
                <span className="text-metatitle text-waterloo dark:text-manatee">
                  QR prêt
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
