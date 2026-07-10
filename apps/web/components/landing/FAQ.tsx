'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import SectionHeader from '@/components/landing/SectionHeader';

interface FaqItem {
  question: string;
  answer: string;
}

const faqData: FaqItem[] = [
  {
    question: 'Comment fonctionne le paiement Mobile Money ?',
    answer:
      'Vos clients paient directement via Kkiapay, CinetPay ou FedaPay avec leur compte Mobile Money. Le billet est généré automatiquement après confirmation du paiement.',
  },
  {
    question: 'Le scanner fonctionne-t-il sans connexion ?',
    answer:
      'Le scanner PWA nécessite une connexion pour valider les QR codes (vérification anti-fraude). Une fois la page chargée, il peut fonctionner quelques instants hors ligne grâce au cache.',
  },
  {
    question: 'Puis-je personnaliser mes billets ?',
    answer:
      'Oui ! Vous pouvez choisir les couleurs, ajouter le logo de votre événement, et personnaliser le design dans le Builder no-code.',
  },
  {
    question: 'Y a-t-il des frais cachés ?',
    answer:
      'Aucun. Vous payez uniquement votre abonnement mensuel. Les frais de transaction Mobile Money (1-2%) sont prélevés directement par le provider.',
  },
  {
    question: "Comment installer le scanner sur un téléphone ?",
    answer:
      `Le scanner est une PWA : ouvrez l'URL dans Chrome sur Android ou Safari sur iOS, puis "Ajouter à l'écran d'accueil". Il s'installe comme une app native.`,
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 lg:py-25 xl:py-30">
      <div className="max-w-c-1315 mx-auto px-4 md:px-8 xl:px-0">
        <SectionHeader
          headerInfo={{
            title: 'FAQ',
            subtitle: 'Questions fréquentes',
            description: 'Tout ce que vous devez savoir sur Fluid Events.',
          }}
        />

        <div className="mx-auto mt-12.5 max-w-[800px] lg:mt-15 xl:mt-20">
          {faqData.map((item, index) => (
            <div
              key={index}
              className="border-b border-stroke dark:border-strokedark"
            >
              <button
                onClick={() => toggle(index)}
                className="flex w-full cursor-pointer items-center justify-between py-5 text-left"
              >
                <span className="text-itemtitle2 font-medium text-black dark:text-white">
                  {item.question}
                </span>
                <ChevronDown
                  className={`ml-4 size-5 shrink-0 text-waterloo transition-transform duration-300 dark:text-manatee ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  openIndex === index ? 'max-h-96 pb-5' : 'max-h-0'
                }`}
              >
                <p className="text-regular text-waterloo dark:text-manatee animate-slide-up">
                  {item.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
