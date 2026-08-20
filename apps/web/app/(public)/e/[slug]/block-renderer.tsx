import { MediaShowcase } from './media-showcase';
import type { MediaAspect } from './media-showcase';
import { TestimonialsCarousel } from './testimonials-carousel';
import { formatEventAddress } from '@saas-events/utils';
import { EventLocation } from './event-location';
import { EventFaq } from './event-faq';
import type { Block, FaqEntry, MediaEntry, ScheduleEntry, SpeakerEntry, TestimonialEntry, TimelineEntry } from '@saas-events/types';
import { Countdown } from './countdown';
import { SponsorsCarousel } from './sponsors-carousel';
import { ScheduleTimeline } from './schedule-timeline';
import { TicketSelector, type PublicEventDay, type PublicTicket } from './ticket-selector';
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
  /** Affiche officielle du hero — image ou vidéo (2026-08-19). */
  officialMediaUrl: string | null;
  officialMediaAspect: string | null;
  heroBackdropUrl: string | null;
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
/**
 * Entrées de l'en-tête — quatre, pas une de plus (décision produit
 * 2026-08-18).
 *
 * Toutes les sections y figuraient : sur une page complète, l'en-tête
 * comptait sept liens et débordait, chacun devenant illisible et aucun ne
 * ressortant. Un visiteur cherche à acheter, à voir qui joue, à savoir quand
 * et où — le reste se trouve en faisant défiler.
 *
 * L'ordre suit celui de la page, pas cette liste : une navigation par ancres
 * qui ne suivrait pas le document désorienterait au lieu de guider.
 */
export const BLOCK_NAV_LABELS: Partial<Record<Block['type'], string>> = {
  tickets: 'Billetterie',
  speakers: 'Line-up',
  schedule: 'Programme',
  location: 'Accès',
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
    // Une entrée ne s'affiche que si sa section a du contenu, sinon le lien
    // mènerait à du vide.
    const hasContent =
      (block.type === 'tickets' && tickets.length > 0) ||
      (block.type === 'speakers' && eventConfig.speakers.length > 0) ||
      block.type === 'schedule' ||
      // Mêmes conditions de « vide » que EventLocation, sinon la nav
      // pointerait vers une section qui ne rend rien.
      (block.type === 'location' &&
        Boolean(
          // Plus `accessNotes` : ces indications sont passées à l'espace
          // client, la section publique ne les montre plus (2026-08-18).
          formatEventAddress(eventConfig) || eventConfig.contactPhone,
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
  eventDays = [],
}: {
  blocks: Block[];
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  eventConfig: EventConfigData;
  navItems: NavItem[];
  eventDays?: PublicEventDay[];
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
            eventDays={eventDays}
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
  eventDays,
}: {
  block: Block;
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  eventDays: PublicEventDay[];
  eventConfig: EventConfigData;
  navItems: NavItem[];
}) {
  const textAlign = block.styles?.textAlign;

  if (block.type === 'hero') {
    return (
      <EventHero
        title={(block.props.title as string) || eventConfig.title}
        accentWord={(block.props.accentWord as string) || null}
        socialProof={(block.props.socialProof as string) || null}
        backdropUrl={eventConfig.heroBackdropUrl}
        lead={(block.props.lead as string) || null}
        description={eventConfig.description}
        imageUrl={(block.props.imageUrl as string) || eventConfig.coverImageUrl}
        // Priorité : le réglage du bloc, puis l'affiche officielle de
        // l'événement, puis rien — le hero retombe alors sur la couverture.
        // Le bloc garde la main pour qui veut une ouverture différente.
        mediaUrl={(block.props.mediaUrl as string) || eventConfig.officialMediaUrl || null}
        mediaAspect={
          ((block.props.mediaUrl
            ? (block.props.mediaAspect as MediaAspect)
            : (eventConfig.officialMediaAspect as MediaAspect)) as MediaAspect) || '4:5'
        }
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
        eventDays={eventDays}
      />
    );
  }

  if (block.type === 'countdown') {
    return <Countdown targetDate={eventConfig.startDate} dateLabel={eventConfig.dateLabel} />;
  }

  if (block.type === 'faq') {
    return <EventFaq faqs={eventConfig.faqs} contactPhone={eventConfig.contactPhone} />;
  }

  if (block.type === 'location') {
    return (
      <EventLocation
        fields={eventConfig}
        accessNotes={eventConfig.accessNotes}
        contactPhone={eventConfig.contactPhone}
        anchorId="block-location"
        days={eventDays}
      />
    );
  }

  if (block.type === 'schedule') {
    // Les journées déclarées nomment le programme au lieu d'un « Deux jours,
    // deux scènes » écrit en dur, faux dès qu'un événement tient sur un jour.
    const jours = eventDays.map((d) => d.label).filter(Boolean);
    const eyebrow = jours.length > 1 ? `${jours.length} journées` : 'Déroulement';
    const quand =
      jours.length > 0
        ? `Le déroulé heure par heure — ${jours.join(', ')}.`
        : 'Le déroulé heure par heure de l’événement.';

    return (
      <SectionShell>
        <SectionHeading eyebrow={eyebrow} title="Le programme" description={quand} />
        {/*
          La section reste visible même sans horaire saisi : un visiteur qui
          suivait le lien « Programme » de l'en-tête atterrissait sinon
          ailleurs, sans jamais apprendre que le déroulé arrivait. Les onglets
          de journée restent eux aussi affichés — ils annoncent le découpage.
        */}
        <ScheduleTimeline
          entries={eventConfig.schedule}
          days={eventDays.map((d) => ({ id: d.id, label: d.label, date: d.date }))}
        />
      </SectionShell>
    );
  }

  if (block.type === 'speakers') {
    if (eventConfig.speakers.length === 0) return null;
    return <SpeakersGrid speakers={eventConfig.speakers} />;
  }

  if (block.type === 'timeline') {
    const entries = (block.props.entries as TimelineEntry[] | undefined) ?? [];
    return (
      <TimelineStrip
        entries={entries}
        title={block.props.title as string | undefined}
        eyebrow={block.props.eyebrow as string | undefined}
        imageUrl={(block.props.imageUrl as string) || null}
        text={(block.props.text as string) || null}
        // Absent = affiché : un bloc posé avant l’existence de ces réglages
        // doit garder l’apparence qu’il avait.
        showImage={block.props.showImage !== false}
        showText={block.props.showText !== false}
        showTimeline={block.props.showTimeline !== false}
      />
    );
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
