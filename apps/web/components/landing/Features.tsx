'use client';

import {
  CreditCard,
  QrCode,
  Palette,
  ShieldCheck,
  BarChart3,
  Smartphone,
} from 'lucide-react';
import SectionHeader from '@/components/landing/SectionHeader';

interface FeatureItem {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
}

const featuresData: FeatureItem[] = [
  {
    icon: CreditCard,
    title: 'Paiement Mobile Money',
    description:
      'Kkiapay, CinetPay, FedaPay — acceptez les paiements que vos clients utilisent vraiment.',
  },
  {
    icon: QrCode,
    title: 'Scanner PWA',
    description:
      "Transformez n'importe quel téléphone en scanner de billets QR. Installation en 1 clic, fonctionne hors ligne.",
  },
  {
    icon: Palette,
    title: 'No-code Builder',
    description:
      'Composez la page de votre événement par blocs. Hero, description, galerie — sans écrire une ligne de code.',
  },
  {
    icon: ShieldCheck,
    title: 'Sécurisé',
    description:
      'QR codes signés HS256, transactions atomiques, stock protégé contre la survente. Audit complet.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard temps réel',
    description:
      'Suivez vos ventes, scans et revenus en direct. Export CSV des participants.',
  },
  {
    icon: Smartphone,
    title: 'Notifications',
    description:
      'Confirmation par email, facture PDF, notification WhatsApp pour vos participants.',
  },
];

export default function Features() {
  return (
    <section id="features" className="py-20 lg:py-25 xl:py-30">
      <div className="max-w-c-1315 mx-auto px-4 md:px-8 xl:px-0">
        <SectionHeader
          headerInfo={{
            title: 'FONCTIONNALITÉS',
            subtitle: 'Tout pour vos événements',
            description:
              "Créez, vendez et contrôlez l'accès à vos événements sans compétence technique. Mobile Money, QR codes, billetterie — tout est inclus.",
          }}
        />

        <div className="mt-12.5 grid grid-cols-1 gap-7.5 md:grid-cols-2 lg:mt-15 lg:grid-cols-3 xl:mt-20 xl:gap-12.5">
          {featuresData.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="animate_top group rounded-lg border border-stroke bg-white p-7.5 shadow-solid-10 dark:border-strokedark dark:bg-blacksection xl:p-12.5"
              >
                <div className="flex h-15 w-15 items-center justify-center rounded-lg bg-zumthor dark:bg-blackho">
                  <Icon className="text-accent-terracotta dark:text-accent-terracotta-dark h-7.5 w-7.5" />
                </div>

                <h3 className="mt-5 text-itemtitle2 font-semibold text-black dark:text-white">
                  {feature.title}
                </h3>

                <p className="mt-3.5 text-regular">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}