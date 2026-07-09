'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function CTA() {
  return (
    <section className="py-20 lg:py-25">
      <div className="max-w-c-1315 mx-auto px-4 md:px-8 xl:px-0">
        <div className="rounded-lg bg-primary px-4 py-12.5 text-center dark:bg-blacksection xl:py-17.5 xl:px-0">
          <h2 className="text-3xl font-bold text-white xl:text-sectiontitle3">
            Prêt à lancer votre événement ?
          </h2>

          <p className="mx-auto mt-5 max-w-[700px] text-white/80">
            Rejoignez les organisateurs africains qui utilisent Fluid Events pour
            leurs concerts, conférences, festivals et soirées.
          </p>

          <Link
            href="/auth/login"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-7.5 py-2.5 text-regular font-medium text-black duration-300 hover:bg-white/90"
          >
            Commencer gratuitement
            <ArrowRight className="size-4" />
          </Link>

          <p className="mt-4 text-white/60">
            Pas de carte bancaire requise. Paiement Mobile Money.
          </p>
        </div>
      </div>
    </section>
  );
}