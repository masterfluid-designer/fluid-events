'use client';

import Link from 'next/link';
import { Check, X, ArrowRight } from 'lucide-react';
import SectionHeader from '@/components/landing/SectionHeader';

interface PricingPlan {
  name: string;
  popular?: boolean;
  price: string;
  period: string;
  features: { text: string; included: boolean }[];
  button: {
    label: string;
    href: string;
    variant: 'primary' | 'outline' | 'ghost';
  };
}

const pricingData: PricingPlan[] = [
  {
    name: 'GRATUIT',
    price: '0 FCFA',
    period: '/mois',
    features: [
      { text: '1 événement', included: true },
      { text: '100 billets', included: true },
      { text: 'Scanner PWA', included: true },
      { text: 'Page événement', included: true },
      { text: 'Email de confirmation', included: true },
    ],
    button: {
      label: 'Démarrer',
      href: '/auth/login',
      variant: 'outline',
    },
  },
  {
    name: 'PRO',
    popular: true,
    price: '9 900 FCFA',
    period: '/mois',
    features: [
      { text: '3 événements', included: true },
      { text: '1 000 billets', included: true },
      { text: 'Scanner PWA', included: true },
      { text: 'No-code Builder', included: true },
      { text: 'Notifications WhatsApp', included: true },
      { text: 'Export CSV', included: true },
      { text: 'Dashboard analytics', included: true },
    ],
    button: {
      label: 'Essayer gratuitement',
      href: '/auth/login',
      variant: 'primary',
    },
  },
  {
    name: 'BUSINESS',
    price: '29 900 FCFA',
    period: '/mois',
    features: [
      { text: 'Événements illimités', included: true },
      { text: '10 000 billets', included: true },
      { text: 'Scanner PWA', included: true },
      { text: 'No-code Builder', included: true },
      { text: 'WhatsApp + Email', included: true },
      { text: 'Export CSV + API', included: true },
      { text: 'Dashboard analytics', included: true },
      { text: 'Support prioritaire', included: true },
    ],
    button: {
      label: 'Nous contacter',
      href: '/auth/login',
      variant: 'ghost',
    },
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="overflow-hidden pb-20 pt-15 lg:pb-25 xl:pb-30">
      <div className="max-w-c-1315 mx-auto px-4 md:px-8 xl:px-0">
        <SectionHeader
          headerInfo={{
            title: 'TARIFS',
            subtitle: 'Simple et transparent',
            description:
              'Un seul plan pour commencer. Pas de frais cachés, pas de surprise.',
          }}
        />

        <div className="mt-12.5 flex flex-wrap justify-center gap-7.5 lg:flex-nowrap lg:mt-15 xl:mt-20 xl:gap-12.5">
          {pricingData.map((plan, index) => (
            <div
              key={index}
              className="animate_top group relative w-full max-w-[410px] rounded-lg border border-stroke bg-white p-7.5 shadow-solid-10 dark:border-strokedark dark:bg-blacksection xl:p-12.5"
            >
              {/* Popular badge */}
              {plan.popular && (
                <span className="absolute -right-3.5 top-7.5 -rotate-90 rounded-bl-full rounded-tl-full bg-primary px-4.5 py-1.5 text-metatitle font-medium uppercase text-primary-foreground">
                  Populaire
                </span>
              )}

              <h3 className="text-itemtitle2 font-semibold text-black dark:text-white">
                {plan.name}
              </h3>

              <div className="mt-3.5 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-black dark:text-white xl:text-sectiontitle3">
                  {plan.price}
                </span>
                <span className="text-regular text-waterloo dark:text-manatee">
                  {plan.period}
                </span>
              </div>

              {/* Features */}
              <ul className="mt-7.5 space-y-3.5">
                {plan.features.map((feature, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-3 text-regular ${
                      feature.included
                        ? 'text-black dark:text-white'
                        : 'opacity-40 text-black dark:text-white'
                    }`}
                  >
                    {feature.included ? (
                      <Check className="text-accent-terracotta size-4.5 shrink-0" />
                    ) : (
                      <X className="size-4.5 shrink-0 text-waterloo" />
                    )}
                    {feature.text}
                  </li>
                ))}
              </ul>

              {/* Button */}
              <Link
                href={plan.button.href}
                className={`group/btn mt-9 inline-flex w-full items-center justify-center gap-2.5 rounded-full px-7.5 py-2.5 text-regular font-medium transition ${
                  plan.button.variant === 'primary'
                    ? 'bg-primary text-primary-foreground hover:bg-primaryho'
                    : plan.button.variant === 'outline'
                      ? 'border border-stroke text-primary hover:bg-primary hover:text-primary-foreground dark:border-strokedark dark:text-white dark:hover:bg-primary dark:hover:text-primary-foreground'
                      : 'text-primary dark:text-white dark:hover:text-primary'
                }`}
              >
                {plan.button.label}
                <ArrowRight className="size-4 transition group-hover/btn:translate-x-0.5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}