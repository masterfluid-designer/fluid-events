import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { EventAccessMode, Block, EventTheme, FaqEntry, MediaEntry, ScheduleEntry, SpeakerEntry } from '@saas-events/types';
import { resolveEventTheme } from '@/lib/event-theme';
import { ResumeCheckout } from './resume-checkout';
import { BlockRenderer, getVisibleNavItems, type EventConfigData, type NavItem } from './block-renderer';
import { TicketSelector } from './ticket-selector';
import { EventHeader } from './event-header';
import { EventHero } from './event-hero';
import { EventBackdrop } from './event-backdrop';
import type { MediaAspect } from '@/lib/media';
import { CtaBand } from './cta-band';
import { EventFooter } from './event-footer';

/**
 * Page événement publique (SSR) — CDC §6.2 route GET /api/events/public/:slug.
 * Accessible sans authentification. CTA "Acheter" déclenche l'OAuth avec intent.
 *
 * Mise en page : sections pleine largeur empilées (header sticky → hero
 * immersif → blocs → bande CTA → footer), pensée pour du desktop/tablette/
 * mobile — et non plus une carte étroite centrée.
 */

interface EventDetail {
  id: string;
  /**
   * Régime d'accès (2026-08-21) : commande les blocs rendus et le parcours
   * d’achat. Optionnel — un événement servi par une API plus ancienne
   * retombe sur la billetterie avec compte, le comportement historique.
   */
  accessMode?: EventAccessMode;
  title: string;
  description: string | null;
  location: string | null;
  venueName: string | null;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  accessNotes: string | null;
  contactPhone: string | null;
  // Prisma sérialise les Decimal en chaîne — `buildMapsUrl` accepte les deux.
  latitude: number | string | null;
  longitude: number | string | null;
  startDate: string;
  endDate: string;
  status: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  officialMediaUrl: string | null;
  officialMediaAspect: string | null;
  heroBackdropUrl: string | null;
  faqs: FaqEntry[];
  schedule: ScheduleEntry[];
  speakers: SpeakerEntry[];
  galleryImages: MediaEntry[];
  sponsorImages: MediaEntry[];
  tickets: Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    stock: number;
    stockSold: number;
    maxPerOrder: number;
    description: string | null;
    compareAtPrice: number | null;
    promoEndsAt: string | null;
    saleStartDate: string | null;
    saleEndDate: string | null;
    dayLabel: string | null;
    // Journée rattachée — c'est elle qui regroupe les billets d'un événement
    // multi-jours, `dayLabel` n'étant qu'un texte hérité (2026-08-18).
    eventDayId: string | null;
    // Rang d'affichage et bénéfices inclus (2026-08-18). `category` existait
    // en base depuis l'origine mais n'avait jamais atteint la page publique.
    category: string | null;
    features: string[];
    // Formule négociée hors ligne (2026-08-18) : affichée, jamais mise au
    // panier — l'API la refuse à `POST /api/payments/init`.
    saleMode: 'ONLINE' | 'ON_REQUEST';
    requestBadge: string | null;
  }>;
  // Journées déclarées, avec leur lieu et leurs horaires propres (2026-08-18).
  days: Array<{
    id: string;
    label: string;
    date: string;
    location: string | null;
    startTime: string | null;
    endTime: string | null;
    latitude: string | null;
    longitude: string | null;
  }>;
  eventPage: { blocks: Block[]; theme: EventTheme | null } | null;
}

async function fetchEvent(slug: string): Promise<EventDetail | null> {
  // Ce fetch tourne côté serveur (composant serveur, SSR) — dans le conteneur
  // Docker `web`, "localhost:4000" ne pointe nulle part (c'est le conteneur
  // web lui-même, pas `api`) : seul le navigateur peut atteindre localhost:4000
  // via le port mappé sur l'hôte. INTERNAL_API_URL (docker-compose.yml,
  // http://api:4000, DNS interne du réseau Docker) prend le pas côté serveur ;
  // en dev natif (hors Docker) elle est absente, NEXT_PUBLIC_API_URL suffit.
  const apiBase =
    process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiBase}/api/events/public/${slug}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEvent(slug);
  if (!event) return { title: 'Événement introuvable' };
  return {
    title: event.title,
    description: event.description ?? undefined,
  };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ resume?: string; orderId?: string }>;
}) {
  const { slug } = await params;
  const { resume, orderId } = await searchParams;
  const event = await fetchEvent(slug);
  if (!event) notFound();

  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(event.startDate));

  const isPublished = event.status === 'PUBLISHED';
  const blocks = event.eventPage?.blocks ?? [];
  const hasBuiltPage = blocks.length > 0;
  const eventConfig: EventConfigData = {
    title: event.title,
    description: event.description,
    location: event.location,
    venueName: event.venueName,
    addressLine: event.addressLine,
    city: event.city,
    country: event.country,
    accessNotes: event.accessNotes,
    contactPhone: event.contactPhone,
    latitude: event.latitude,
    longitude: event.longitude,
    coverImageUrl: event.coverImageUrl,
    officialMediaUrl: event.officialMediaUrl,
    officialMediaAspect: event.officialMediaAspect,
    heroBackdropUrl: event.heroBackdropUrl,
    dateLabel,
    startDate: event.startDate,
    faqs: event.faqs,
    schedule: event.schedule,
    speakers: event.speakers,
    galleryImages: event.galleryImages,
    sponsorImages: event.sponsorImages,
  };

  // Équivalent condensé de la nav multi-pages d'orncity (Accueil/Programme/
  // Line-up/Billetterie/.../Infos&FAQ) sur notre modèle une-seule-page. Sur le
  // rendu de repli (aucun bloc posé), seule la billetterie existe réellement.
  const navItems: NavItem[] = hasBuiltPage
    ? getVisibleNavItems(blocks, event.tickets, eventConfig)
    : event.tickets.length > 0
      ? [{ id: 'block-tickets', label: 'Billetterie' }]
      : [];
  const ticketsAnchor = navItems.find((item) => item.id === 'block-tickets');
  // Le thème BRUT porte les réglages d’en-tête ; `theme` n’en garde que ce
  // qui devient du CSS.
  const themeRaw = event.eventPage?.theme ?? null;
  const theme = resolveEventTheme(event.eventPage?.theme);

  return (
    <main
      // `public-surface` : la palette de base, jamais celle choisie dans un
      // tableau de bord (2026-08-17). Le thème de l’organisateur, lui, passe
      // par `style` et l’emporte sur cette classe.
      className={`public-surface event-theme min-h-svh ${theme.hasCustomBackground ? '' : 'bg-white dark:bg-blackho'} ${theme.backdrop ? 'event-has-backdrop' : ''} ${theme.fontClassName}`}
      style={theme.style}
    >
      {/*
        Palettes claire ET sombre de l’organisateur (2026-08-20).

        En <style> et non en style inline : un attribut `style` ne sait pas
        dire « et en thème sombre, ceci ». C’est ce qui faisait que la couleur
        d’accent restait identique dans les deux modes, jusqu’à devenir
        illisible sur l’un des deux.

        Le contenu est sûr : chaque couleur a été revalidée en HEX strict
        avant d’arriver ici (voir resolveEventTheme), rien d’autre ne compose
        cette chaîne.
      */}
      {theme.css && <style dangerouslySetInnerHTML={{ __html: theme.css }} />}

      {/* Avant tout le reste : la couche est `fixed`, sa position dans le
          balisage ne change rien à l'écran, mais elle se lit ici comme ce
          qu'elle est — le décor sur lequel la page est posée. */}
      {theme.backdrop && <EventBackdrop backdrop={theme.backdrop} />}

      {/* Réglages d’en-tête (2026-08-20) : logo par thème, titre, boutons.
          Les valeurs par défaut restent celles d’avant — un événement qui
          n’a rien réglé garde exactement l’en-tête qu’il avait. */}
      <EventHeader
        eventTitle={themeRaw?.headerTitle?.trim() || event.title}
        logoUrl={themeRaw?.headerLogoUrl || event.logoUrl}
        logoUrlDark={themeRaw?.headerLogoUrlDark ?? null}
        slug={slug}
        // Le menu masque ce que l’organisateur a décoché. On filtre ici et
        // non dans getVisibleNavItems : le pied de page, lui, garde la liste
        // complète — s’y retrouver après avoir lu la page reste utile.
        navItems={navItems.filter(
          (i) => !(themeRaw?.headerHiddenNav ?? []).includes(i.id.replace('block-', '')),
        )}
        showMyTicket={themeRaw?.headerShowMyTicket !== false}
        showBuy={themeRaw?.headerShowBuy !== false}
        showThemeToggle={themeRaw?.headerShowThemeToggle !== false}
      />

      {hasBuiltPage ? (
        <BlockRenderer
          blocks={blocks}
          tickets={event.tickets}
          isPublished={isPublished}
          slug={slug}
          eventConfig={eventConfig}
          navItems={navItems}
          eventDays={event.days}
          accessMode={event.accessMode}
        />
      ) : (
        <>
          <EventHero
            title={event.title}
            description={event.description}
            imageUrl={event.coverImageUrl}
            mediaUrl={event.officialMediaUrl}
            mediaAspect={(event.officialMediaAspect as MediaAspect) || '4:5'}
            backdropUrl={event.heroBackdropUrl}
            dateLabel={dateLabel}
            location={event.location}
            isPublished={isPublished}
            ticketsAnchorId={ticketsAnchor?.id}
            stat={
              event.tickets.length > 0
                ? { value: String(event.tickets.length), label: 'formules de billets' }
                : null
            }
          />
          <TicketSelector
            tickets={event.tickets}
            slug={slug}
            isPublished={isPublished}
            contactPhone={event.contactPhone}
            eventDays={event.days}
          />
        </>
      )}

      {ticketsAnchor && <CtaBand eventTitle={event.title} ticketsAnchorId={ticketsAnchor.id} />}

      <EventFooter
        eventTitle={event.title}
        location={event.location}
        dateLabel={dateLabel}
        navItems={navItems}
      />
      <ResumeCheckout slug={slug} resume={resume === '1'} orderId={orderId} />
    </main>
  );
}
