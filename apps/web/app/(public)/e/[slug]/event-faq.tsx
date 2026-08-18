'use client';

import { Accordion as AccordionPrimitive } from 'radix-ui';
import { MessageCircle, Plus } from 'lucide-react';
import type { FaqEntry } from '@saas-events/types';
import { SectionShell } from './section-shell';
import { SectionEyebrow } from './section-eyebrow';

/**
 * EventFaq — FAQ de la page publique en DEUX COLONNES (refonte 2026-08-18).
 *
 * L'ancienne version empilait le titre puis un accordéon étroit : le titre
 * disparaissait dès la première question ouverte, et le visiteur déroulait une
 * liste sans plus savoir de quoi elle traitait ni à qui s'adresser si sa
 * question n'y était pas. Le titre et l'invitation à contacter tiennent
 * désormais dans une colonne gauche COLLANTE, présente tant qu'on lit.
 *
 * Accordéon dédié plutôt que le composant partagé `ui/accordion` : celui-ci
 * sert aussi le Builder, et son chevron y a sa place. Ici on veut la bascule
 * +/× de la maquette — un seul glyphe qui pivote, donc une seule icône à
 * charger et une transition qui montre le lien entre les deux états.
 */
export function EventFaq({
  faqs,
  contactPhone,
  anchorId,
}: {
  faqs: FaqEntry[];
  contactPhone?: string | null;
  anchorId?: string;
}) {
  if (faqs.length === 0) return null;

  // wa.me attend le numéro international SANS « + » ni séparateurs (même
  // nettoyage que le bloc Accès et les formules sur réservation).
  const whatsappNumber = contactPhone?.replace(/[^0-9]/g, '') || null;

  return (
    <SectionShell id={anchorId} tone="muted">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionEyebrow>Bon à savoir</SectionEyebrow>
          <h2 className="mt-2.5 font-event text-4xl leading-[0.95] tracking-tight md:text-5xl">
            Questions fréquentes
          </h2>
          <p className="mt-4 text-base leading-relaxed text-waterloo dark:text-manatee">
            Les réponses aux questions qui reviennent le plus avant votre venue.
          </p>

          {/* La porte de sortie de la FAQ : elle ne sert à rien si elle n'est
              visible qu'après avoir tout déroulé pour ne rien trouver. */}
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-stroke px-5 py-2.5 text-sm font-semibold transition-colors hover:border-black dark:border-strokedark dark:hover:border-white"
            >
              <MessageCircle className="size-4" /> Votre question n&apos;y est pas ?
            </a>
          )}
        </div>

        <AccordionPrimitive.Root type="single" collapsible className="min-w-0">
          {faqs.map((faq) => (
            <AccordionPrimitive.Item
              key={faq.id}
              value={faq.id}
              className="border-b border-stroke last:border-b-0 dark:border-strokedark"
            >
              <AccordionPrimitive.Header className="flex">
                <AccordionPrimitive.Trigger
                  // Le « + » pivote de 45° pour devenir une croix : la même
                  // forme dit « ouvrir » puis « fermer », et le mouvement rend
                  // le lien entre les deux évident.
                  className="group flex flex-1 items-center justify-between gap-6 py-5 text-left"
                >
                  <span className="font-event text-lg leading-snug md:text-xl">{faq.question}</span>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-stroke transition-colors group-hover:border-black dark:border-strokedark dark:group-hover:border-white">
                    <Plus className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-45" />
                  </span>
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                {/* `whitespace-pre-line` : une réponse saisie sur plusieurs
                    paragraphes doit le rester. */}
                <p className="max-w-2xl whitespace-pre-line pb-6 text-sm leading-relaxed text-waterloo dark:text-manatee md:text-base">
                  {faq.answer}
                </p>
              </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
          ))}
        </AccordionPrimitive.Root>
      </div>
    </SectionShell>
  );
}
