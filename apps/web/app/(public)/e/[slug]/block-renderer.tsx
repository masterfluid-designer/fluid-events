import type { Block, FaqEntry, MediaEntry, ScheduleEntry, SpeakerEntry } from '@saas-events/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Countdown } from './countdown';
import { SponsorsCarousel } from './sponsors-carousel';

/**
 * BlockRenderer — Rend les blocs Builder (CDC §11) sur la page publique.
 *
 * Rendu minimal cohérent avec ce que le Builder permet réellement d'éditer
 * (apps/web/app/(dashboard)/manager/builder/page.tsx) : hero/texte/billets/html
 * ont un rendu dédié depuis leurs propres `props`. faq/schedule/speakers/
 * gallery/sponsors sont des blocs de PLACEMENT (décision produit 2026-07-13) —
 * ils n'ont pas de `props` propres, ils affichent le contenu centralisé de
 * l'événement (`eventConfig`, un seul jeu de données, édité depuis l'onglet
 * Config du Builder). `countdown` ignore aussi ses `props` : il décompte
 * automatiquement jusqu'à `eventConfig.startDate`. Les types restants
 * (image/vidéo/testimonials) gardent un rendu générique titre + contenu.
 *
 * `styles.customClassName` (décision produit 2026-07-13) : classes Tailwind
 * libres appliquées au conteneur de chaque bloc, validées côté backend par une
 * regex restreinte à la syntaxe Tailwind (`blocks.schema.ts`). Limite connue :
 * Tailwind v4 ne génère du CSS que pour les classes détectées au build — une
 * classe inédite tapée à l'exécution n'aura d'effet que si elle existe déjà
 * ailleurs dans le bundle compilé.
 */

interface PublicTicket {
  id: string;
  name: string;
  price: number;
  currency: string;
  stock: number;
  stockSold: number;
}

export interface EventConfigData {
  startDate: string;
  faqs: FaqEntry[];
  schedule: ScheduleEntry[];
  speakers: SpeakerEntry[];
  galleryImages: MediaEntry[];
  sponsorImages: MediaEntry[];
}

export function BlockRenderer({
  blocks,
  tickets,
  isPublished,
  slug,
  eventConfig,
  BuyButton,
}: {
  blocks: Block[];
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  eventConfig: EventConfigData;
  BuyButton: (props: { slug: string; ticketId: string; highlighted: boolean }) => React.JSX.Element;
}) {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  return (
    <>
      {sorted.map((block) => (
        <div key={block.id} className={block.styles?.customClassName}>
          <BlockItem
            block={block}
            tickets={tickets}
            isPublished={isPublished}
            slug={slug}
            eventConfig={eventConfig}
            BuyButton={BuyButton}
          />
        </div>
      ))}
    </>
  );
}

function BlockItem({
  block,
  tickets,
  isPublished,
  slug,
  eventConfig,
  BuyButton,
}: {
  block: Block;
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  eventConfig: EventConfigData;
  BuyButton: (props: { slug: string; ticketId: string; highlighted: boolean }) => React.JSX.Element;
}) {
  const textAlign = block.styles?.textAlign;

  if (block.type === 'hero') {
    const imageUrl = block.props.imageUrl as string | undefined;
    return (
      <div
        className="relative h-64 w-full bg-[repeating-linear-gradient(135deg,#EFEDE7_0_14px,#E7E4DE_14px_28px)] dark:bg-[repeating-linear-gradient(135deg,#24221F_0_14px,#1B1A18_14px_28px)] md:h-85"
        style={{
          backgroundColor: block.styles?.backgroundColor || undefined,
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute inset-x-6 bottom-5 text-white md:inset-x-9 md:bottom-6" style={{ textAlign }}>
          <h1 className="font-serif text-3xl leading-[1.05] md:text-4xl">
            {(block.props.title as string) || ''}
          </h1>
        </div>
      </div>
    );
  }

  if (block.type === 'text') {
    return (
      <p
        className="max-w-150 whitespace-pre-line px-6 py-4 text-[15px] leading-relaxed text-waterloo dark:text-manatee md:px-9"
        style={{ textAlign }}
      >
        {(block.props.content as string) || ''}
      </p>
    );
  }

  if (block.type === 'html') {
    // Contenu déjà nettoyé côté serveur à l'écriture (BuilderService +
    // sanitizeBlockHtml, décision produit 2026-07-13) — jamais de nouvelle
    // passe de nettoyage ici, la BDD fait foi (même principe que la
    // whitelist d'URL image).
    return (
      <div
        className="px-6 py-4 md:px-9 [&_a]:underline [&_img]:max-w-full [&_img]:rounded-lg"
        style={{ textAlign }}
        dangerouslySetInnerHTML={{ __html: (block.props.htmlContent as string) || '' }}
      />
    );
  }

  if (block.type === 'tickets') {
    return (
      <div className="flex flex-col gap-3 px-6 py-8 md:px-9">
        <div className="mb-1 text-xs font-bold uppercase tracking-[0.04em] text-manatee dark:text-waterloo">
          Billets
        </div>
        {tickets.length === 0 ? (
          <div className="rounded-xl border border-stroke p-6 text-center text-sm text-muted-foreground dark:border-strokedark">
            Aucun billet en vente pour le moment.
          </div>
        ) : (
          tickets.map((ticket, index) => {
            const available = ticket.stock - ticket.stockSold;
            const soldOut = available <= 0;
            const highlighted = index === 0 && !soldOut;
            return (
              <div
                key={ticket.id}
                className={`flex items-center justify-between gap-4 rounded-xl border p-5 ${
                  soldOut ? 'opacity-50' : ''
                } ${highlighted ? 'border-black dark:border-white' : 'border-stroke dark:border-strokedark'}`}
              >
                <div>
                  <div className="font-semibold">{ticket.name}</div>
                  <div className="mt-0.5 text-xs text-manatee dark:text-waterloo">
                    {soldOut
                      ? 'Épuisé'
                      : `${available} place${available > 1 ? 's' : ''} restante${available > 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-bold">
                    {new Intl.NumberFormat('fr-FR', {
                      style: 'currency',
                      currency: ticket.currency,
                    }).format(Number(ticket.price))}
                  </div>
                  {soldOut || !isPublished ? (
                    <span className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-semibold text-manatee dark:border-strokedark">
                      Indisponible
                    </span>
                  ) : (
                    <BuyButton slug={slug} ticketId={ticket.id} highlighted={highlighted} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  if (block.type === 'countdown') {
    return <Countdown targetDate={eventConfig.startDate} />;
  }

  if (block.type === 'faq') {
    if (eventConfig.faqs.length === 0) return null;
    return (
      <div className="px-6 py-8 md:px-9">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-manatee dark:text-waterloo">
          Questions fréquentes
        </div>
        <Accordion type="single" collapsible>
          {eventConfig.faqs.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  }

  if (block.type === 'schedule') {
    if (eventConfig.schedule.length === 0) return null;
    const sortedSchedule = [...eventConfig.schedule].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    return (
      <div className="px-6 py-8 md:px-9">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-manatee dark:text-waterloo">
          Programme
        </div>
        <div className="flex flex-col gap-3">
          {sortedSchedule.map((entry) => (
            <div key={entry.id} className="flex gap-4 rounded-xl border border-stroke p-4 dark:border-strokedark">
              <div className="w-28 shrink-0 text-xs font-semibold text-accent-terracotta dark:text-accent-terracotta-dark">
                {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
                  new Date(entry.startsAt),
                )}
              </div>
              <div>
                <div className="font-semibold">{entry.title}</div>
                {entry.description && (
                  <div className="mt-0.5 text-sm text-waterloo dark:text-manatee">{entry.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'speakers') {
    if (eventConfig.speakers.length === 0) return null;
    return (
      <div className="px-6 py-8 md:px-9">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-manatee dark:text-waterloo">
          Speakers
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {eventConfig.speakers.map((speaker) => (
            <div key={speaker.id} className="flex flex-col items-center text-center">
              {speaker.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={speaker.photoUrl} alt={speaker.name} className="size-20 rounded-full object-cover" />
              ) : (
                <div className="size-20 rounded-full bg-secondary" />
              )}
              <div className="mt-2 text-sm font-semibold">{speaker.name}</div>
              <div className="text-xs text-waterloo dark:text-manatee">{speaker.role}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'gallery') {
    if (eventConfig.galleryImages.length === 0) return null;
    return (
      <div className="grid grid-cols-2 gap-2 px-6 py-8 md:grid-cols-3 md:px-9">
        {eventConfig.galleryImages.map((img) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={img.id} src={img.url} alt="" className="aspect-square w-full rounded-xl object-cover" />
        ))}
      </div>
    );
  }

  if (block.type === 'sponsors') {
    if (eventConfig.sponsorImages.length === 0) return null;
    return <SponsorsCarousel images={eventConfig.sponsorImages} />;
  }

  // Rendu générique (image/video/testimonials) — seuls titre + contenu sont
  // éditables sur ces types dans le Builder.
  return (
    <div className="px-6 py-4 md:px-9" style={{ textAlign }}>
      {(block.props.title as string) && (
        <div className="text-lg font-semibold">{block.props.title as string}</div>
      )}
      {(block.props.content as string) && (
        <div className="mt-1 text-sm text-waterloo dark:text-manatee">
          {block.props.content as string}
        </div>
      )}
      {block.type === 'image' && (block.props.imageUrl as string) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.props.imageUrl as string} alt="" className="mt-3 max-h-96 w-full rounded-xl object-cover" />
      )}
    </div>
  );
}
