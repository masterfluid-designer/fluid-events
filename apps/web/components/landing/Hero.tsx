'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function Hero() {
  return (
    <section className="overflow-hidden pb-20 pt-35 md:pt-40 xl:pb-25 xl:pt-46">
      <div className="max-w-c-1390 mx-auto px-4 md:px-8 2xl:px-0">
        <div className="lg:flex lg:items-center lg:gap-8 xl:gap-32.5">
          {/* ── Left side ── */}
          <div className="md:w-1/2">
            <span className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-stroke px-4.5 py-1.5 text-metatitle font-medium text-black dark:border-strokedark dark:text-white">
              🚀 Plateforme événementielle africaine
            </span>

            <h1 className="mb-5 text-hero font-bold leading-tight text-black dark:text-white xl:text-sectiontitle3">
              Organisez. Vendez. Scannez.{' '}
              <span className="relative z-1 before:absolute before:bottom-2.5 before:left-0 before:-z-1 before:h-3 before:w-full before:bg-titlebg dark:before:bg-titlebgdark">
                Sans stress.
              </span>
            </h1>

            <p className="mb-8 text-regular text-waterloo dark:text-manatee">
              Créez vos événements en quelques clics, vendez des billets via
              Mobile Money (Kkiapay, CinetPay, FedaPay) et scannez les entrées
              avec votre téléphone — le tout sans aucune compétence technique.
            </p>

            {/* ── Email form (visual only, no action) ── */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                placeholder="votre@email.com"
                className="w-full rounded-full border border-stroke bg-transparent px-6 py-2.5 text-regular text-black placeholder-waterloo outline-none transition focus:border-primary dark:border-strokedark dark:text-white dark:placeholder-manatee dark:focus:border-primary"
              />
              <Link
                href="#"
                className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-black px-8 py-2.5 text-white transition hover:bg-blackho dark:bg-btndark dark:hover:bg-blackho"
              >
                Commencer gratuitement
                <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>

            <p className="text-metatitle text-manatee dark:text-waterloo">
              Pas de carte bancaire requise. Paiement Mobile Money.
            </p>
          </div>

          {/* ── Right side: Dashboard preview ── */}
          <div className="hidden md:block md:w-1/2">
            <Image
              src="/images/hero/hero-light.svg"
              alt="Aperçu du tableau de bord Fluid Events"
              width={680}
              height={520}
              className="dark:hidden"
              priority
            />
            <Image
              src="/images/hero/hero-dark.svg"
              alt="Aperçu du tableau de bord Fluid Events"
              width={680}
              height={520}
              className="hidden dark:block"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}