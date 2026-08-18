import { MediaShowcase } from './media-showcase';
import type { MediaAspect } from './media-showcase';
import { TestimonialsCarousel } from './testimonials-carousel';
import { formatEventAddress } from '@saas-events/utils';
import { EventLocation } from './event-location';
import type { Block, FaqEntry, MediaEntry, ScheduleEntry, SpeakerEntry, TestimonialEntry, TimelineEntry } from '@saas-events/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Countdown } from './countdown';
import { SponsorsCarousel } from './sponsors-carousel';
import { TicketSelector, type PublicTicket } from './ticket-selector';
import { SpeakersGrid } from './speakers-grid';
import { TimelineStrip } from './timeline-strip';
import { SectionShell, SectionHeading } from './section-shell';
import { EventHero } from './event-hero';

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
 * Mise en page : chaque bloc est une SECTION pleine largeur (SectionShell),
 * pas un élément d'une carte étroite — voir section-shell.tsx.
 *
 * `styles.customClassName` (décision produit 2026-07-13) : classes Tailwind
 * libres appliquées au conteneur de chaque bloc, validées côté backend par une
 * regex restreinte à la syntaxe Tailwind (`blocks.schema.ts`). Limite connue :
 * Tailwind v4 ne génère du CSS que pour les classes détectées au build — une
 * classe inédite tapée à l'exécution n'aura d'effet que si elle existe déjà
 * ailleurs dans le bundle compilé.
 */

export interface EventConfigData {
  title: string;
  description: string | null;
  location: string | null;
  // Localisation structurée (2026-08-16) — alimente le bloc `location`.
  // `location` reste le repli d’affichage pour les événements antérieurs.
  venueName: string | null;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  accessNotes: string | null;
  contactPhone: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  coverImageUrl: string | null;
  /** Date de début déjà formatée en français (calculée une fois côté page). */
  dateLabel: string;
  startDate: string;
  faqs: FaqEntry[];
  schedule: ScheduleEntry[];
  speakers: SpeakerEntry[];
  galleryImages: MediaEntry[];
  sponsorImages: MediaEntry[];
}

/**
 * Sections de la page publique qui méritent une entrée dans la nav en ancre /
 * le footer événement (équivalent condensé sur une seule page du menu
 * multi-pages Accueil/Programme/Line-up/Billetterie/.../Infos&FAQ d'orncity —
 * décision produit "condenser en une seule landing page").
 */
export const BLOCK_NAV_LABELS: Partial<Record<Block['type'], string>> = {
  tickets: 'Billetterie',
  schedule: 'Programme',
  speakers: 'Line-up',
  sponsors: 'Partenaires',
  faq: 'Infos & FAQ',
  gallery: 'Galerie',
  timeline: 'Notre histoire',
  location: 'Accès',
  testimonials: 'Témoignages',
  video: 'Vidéo',
};

export interface NavItem {
  id: string;
  label: string;
}

/**
 * Calcule les entrées de nav à afficher — uniquement les blocs qui vont
 * RÉELLEMENT rendre du contenu (mêmes conditions de "vide" que BlockItem
 * ci-dessous), pour ne jamais pointer vers une section fantôme.
 */
export function getVisibleNavItems(
  blocks: Block[],
  tickets: PublicTicket[],
  eventConfig: EventConfigData,
): NavItem[] {
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const block of [...blocks].sort((a, b) => a.order - b.order)) {
    const label = BLOCK_NAV_LABELS[block.type];
    if (!label || seen.has(block.type)) continue;
    const hasContent =
      (block.type === 'tickets' && tickets.length > 0) ||
      (block.type === 'schedule' && eventConfig.schedule.length > 0) ||
      (block.type === 'speakers' && eventConfig.speakers.length > 0) ||
      (block.type === 'sponsors' && eventConfig.sponsorImages.length > 0) ||
      (block.type === 'faq' && eventConfig.faqs.length > 0) ||
      (block.type === 'gallery' && eventConfig.galleryImages.length > 0) ||
      (block.type === 'timeline' && ((block.props.entries as unknown[] | undefined)?.length ?? 0) > 0) ||
      (block.type === 'testimonials' &&
        ((block.props.entries as unknown[] | undefined)?.length ?? 0) > 0) ||
      (block.type === 'video' && Boolean(block.props.mediaUrl)) ||
      // Mêmes conditions de « vide » que EventLocation, sinon la nav
      // pointerait vers une section qui ne rend rien.
      (block.type === 'location' &&
        Boolean(
          formatEventAddress(eventConfig) || eventConfig.accessNotes || eventConfig.contactPhone,
        ));
    if (!hasContent) continue;
    seen.add(block.type);
    items.push({ id: `block-${block.type}`, label });
  }
  return items;
}

export function BlockRenderer({
  blocks,
  tickets,
  isPublished,
  slug,
  eventConfig,
  navItems,
}: {
  blocks: Block[];
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  eventConfig: EventConfigData;
  navItems: NavItem[];
}) {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  return (
    <>
      {sorted.map((block) => (
        <div
          key={block.id}
          id={`block-${block.type}`}
          className={`scroll-mt-16 md:scroll-mt-18 ${block.styles?.customClassName ?? ''}`}
        >
          <BlockItem
            block={block}
            tickets={tickets}
            isPublished={isPublished}
            slug={slug}
            eventConfig={eventConfig}
            navItems={navItems}
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
  navItems,
}: {
  block: Block;
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  eventConfig: EventConfigData;
  navItems: NavItem[];
}) {
  const textAlign = block.styles?.textAlign;

  if (block.type === 'hero') {
    return (
      <EventHero
        title={(block.props.title as string) || eventConfig.title}
        description={eventConfig.description}
        imageUrl={(block.props.imageUrl as string) || eventConfig.coverImageUrl}
        mediaUrl={(block.props.mediaUrl as string) || null}
        mediaAspect={(block.props.mediaAspect as MediaAspect) || '4:5'}
        dateLabel={eventConfig.dateLabel}
        location={eventConfig.location}
        isPublished={isPublished}
        ticketsAnchorId={navItems.find((i) => i.id === 'block-tickets')?.id}
        scheduleAnchorId={navItems.find((i) => i.id === 'block-schedule')?.id}
        stat={
          eventConfig.speakers.length > 0
            ? { value: String(eventConfig.speakers.length), label: "à l'affiche" }
            : tickets.length > 0
              ? { value: String(tickets.length), label: 'formules de billets' }
              : null
        }
      />
    );
  }

  if (block.type === 'text') {
    return (
      <SectionShell>
        <p
          className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-waterloo dark:text-manatee md:text-lg"
          style={{ textAlign }}
        >
          {(block.props.content as string) || ''}
        </p>
      </SectionShell>
    );
  }

  if (block.type === 'html') {
    // Contenu déjà nettoyé côté serveur à l'écriture (BuilderService +
    // sanitizeBlockHtml, décision produit 2026-07-13) — jamais de nouvelle
    // passe de nettoyage ici, la BDD fait foi (même principe que la
    // whitelist d'URL image).
    return (
      <SectionShell>
        <div
          className="[&_a]:underline [&_img]:max-w-full [&_img]:rounded-xl"
          style={{ textAlign }}
          dangerouslySetInnerHTML={{ __html: (block.props.htmlContent as string) || '' }}
        />
      </SectionShell>
    );
  }

  if (block.type === 'tickets') {
    return (
      <TicketSelector
        tickets={tickets}
        slug={slug}
        isPublished={isPublished}
        contactPhone={eventConfig.contactPhone}
      />
    );
  }

  if (block.type === 'countdown') {
    return <Countdown targetDate={eventConfig.startDate} dateLabel={eventConfig.dateLabel} />;
  }

  if (block.type === 'faq') {
    if (eventConfig.faqs.length === 0) return null;
    return (
      <SectionShell tone="muted">
        <SectionHeading
          eyebrow="Bon à savoir"
          title="Infos pratiques & FAQ"
          description="Les réponses aux questions les plus fréquentes avant votre venue."
        />
        <div className="max-w-3xl">
          <Accordion type="single" collapsible>
            {eventConfig.faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger className="text-left text-base">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </SectionShell>
    );
  }

  if (block.type === 'location') {
    return (
      <EventLocation
        fields={eventConfig}
        accessNotes={eventConfig.accessNotes}
        contactPhone={eventConfig.contactPhone}
        anchorId="block-location"
      />
    );
  }

  if (block.type === 'schedule') {
    if (eventConfig.schedule.length === 0) return null;
    const sortedSchedule = [...eventConfig.schedule].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    return (
      <SectionShell>
        <SectionHeading
          eyebrow="Deux jours, deux scènes"
          title="Le programme"
          description="Le déroulé heure par heure de l'événement."
        />
        <div className="flex flex-col gap-3">
          {sortedSchedule.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col gap-2 rounded-2xl border border-stroke p-5 dark:border-strokedark sm:flex-row sm:gap-6"
            >
              <div className="shrink-0 text-xs font-bold uppercase tracking-wide text-accent-terracotta dark:text-accent-terracotta-dark sm:w-40">
                {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
                  new Date(entry.startsAt),
                )}
              </div>
              <div>
                <div className="font-semibold md:text-lg">{entry.title}</div>
                {entry.description && (
                  <div className="mt-1 text-sm text-waterloo dark:text-manatee">{entry.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (block.type === 'speakers') {
    if (eventConfig.speakers.length === 0) return null;
    return <SpeakersGrid speakers={eventConfig.speakers} />;
  }

  if (block.type === 'timeline') {
    const entries = (block.props.entries as TimelineEntry[] | undefined) ?? [];
    return <TimelineStrip entries={entries} title={block.props.title as string | undefined} />;
  }

  if (block.type === 'gallery') {
    if (eventConfig.galleryImages.length === 0) return null;
    return (
      <SectionShell tone="muted">
        <SectionHeading eyebrow="Ambiance" title="La galerie" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {eventConfig.galleryImages.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.url}
              alt=""
              className="aspect-square w-full rounded-2xl object-cover transition-transform hover:scale-[1.02]"
            />
          ))}
        </div>
      </SectionShell>
    );
  }

  if (block.type === 'sponsors') {
    if (eventConfig.sponsorImages.length === 0) return null;
    return (
      <SectionShell>
        <SectionHeading
          eyebrow="Ensemble"
          title="Nos partenaires"
          description="Ils soutiennent l'événement et rendent la fête possible."
        />
        <SponsorsCarousel images={eventConfig.sponsorImages} />
      </SectionShell>
    );
  }

  if (block.type === 'video') {
    const mediaUrl = (block.props.mediaUrl as string) || null;
    if (!mediaUrl) return null;
    return (
      <SectionShell>
        {((block.props.title as string) || (block.props.content as string)) && (
          <SectionHeading
            eyebrow="En images"
            title={(block.props.title as string) || ""}
            description={(block.props.content as string) || undefined}
          />
        )}
        {/* Largeur limitée : une vidéo étirée sur toute la page force à
            balayer l’écran des yeux pour la suivre. */}
        <div className="mx-auto max-w-4xl">
          <MediaShowcase
            url={mediaUrl}
            aspect={(block.props.mediaAspect as MediaAspect) || '16:9'}
            alt={(block.props.title as string) || ""}
          />
        </div>
      </SectionShell>
    );
  }

  if (block.type === 'testimonials') {
    const entries = (block.props.entries as TestimonialEntry[] | undefined) ?? [];
    if (entries.length === 0) return null;
    return (
      <SectionShell tone="muted">
        <SectionHeading
          eyebrow="Ils y étaient"
          title={(block.props.title as string) || "Ce qu’ils en disent"}
          description={(block.props.content as string) || undefined}
        />
        <TestimonialsCarousel entries={entries} />
      </SectionShell>
    );
  }

  // Rendu générique (image) — seuls titre + contenu sont
  // éditables sur ces types dans le Builder.
  return (
    <SectionShell>
      <div style={{ textAlign }}>
        {(block.props.title as string) && (
          <h2 className="font-event text-2xl md:text-3xl">{block.props.title as string}</h2>
        )}
        {(block.props.content as string) && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-waterloo dark:text-manatee md:text-base">
            {block.props.content as string}
          </p>
        )}
        {block.type === 'image' && (block.props.imageUrl as string) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.props.imageUrl as string}
            alt=""
            className="mt-5 max-h-[32rem] w-full rounded-2xl object-cover"
          />
        )}
      </div>
    </SectionShell>
  );
}
