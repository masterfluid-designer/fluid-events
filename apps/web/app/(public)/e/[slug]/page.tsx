import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, MapPin, ArrowLeft, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import type { Block, FaqEntry, MediaEntry, ScheduleEntry, SpeakerEntry } from '@saas-events/types';
import { ResumeCheckout } from './resume-checkout';
import { BlockRenderer } from './block-renderer';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * Page événement publique (SSR) — CDC §6.2 route GET /api/events/public/:slug.
 * Accessible sans authentification. CTA "Acheter" déclenche l'OAuth avec intent.
 */

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: string;
  endDate: string;
  status: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
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
  }>;
  eventPage: { blocks: Block[] } | null;
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

  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(event.startDate));

  const isPublished = event.status === 'PUBLISHED';
  const blocks = event.eventPage?.blocks ?? [];
  const hasBuiltPage = blocks.length > 0;

  return (
    <main className="min-h-svh bg-alabaster dark:bg-blackho">
      {/* Header obligatoire (décision produit 2026-07-13) : logo à gauche,
          "Mon ticket" à droite — jamais un bloc du Builder, toujours présent
          quel que soit le contenu de la page. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-stroke bg-white/90 px-4 py-3 backdrop-blur-sm dark:border-strokedark dark:bg-blacksection/90 md:px-8">
        <div className="flex items-center gap-2.5">
          {event.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.logoUrl} alt={event.title} className="size-8 rounded-lg object-cover" />
          ) : null}
          <span className="font-serif text-base font-semibold md:text-lg">{event.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={`/client?event=${encodeURIComponent(slug)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primaryho"
          >
            <Ticket className="size-3.5" /> Mon ticket
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-190 px-4 py-8 md:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-stroke bg-white shadow-solid-2 dark:border-strokedark dark:bg-blacksection">
          <Link
            href="/"
            className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-black backdrop-blur"
          >
            <ArrowLeft className="size-3.5" /> Retour
          </Link>

          {hasBuiltPage ? (
            <BlockRenderer
              blocks={blocks}
              tickets={event.tickets}
              isPublished={isPublished}
              slug={slug}
              eventConfig={{
                startDate: event.startDate,
                faqs: event.faqs,
                schedule: event.schedule,
                speakers: event.speakers,
                galleryImages: event.galleryImages,
                sponsorImages: event.sponsorImages,
              }}
              BuyButton={BuyButton}
            />
          ) : (
            <>
              {/* Cover */}
              <div className="relative h-64 w-full bg-[repeating-linear-gradient(135deg,#EFEDE7_0_14px,#E7E4DE_14px_28px)] dark:bg-[repeating-linear-gradient(135deg,#24221F_0_14px,#1B1A18_14px_28px)] md:h-85">
                {event.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.coverImageUrl}
                    alt={event.title}
                    className="size-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                <div className="absolute inset-x-6 bottom-5 text-white md:inset-x-9 md:bottom-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] opacity-85">
                    {formattedDate}
                    {event.location ? ` · ${event.location}` : ''}
                  </div>
                  <h1 className="mt-1.5 font-serif text-3xl leading-[1.05] md:text-4xl">
                    {event.title}
                  </h1>
                </div>
              </div>

              <div className="px-6 pb-2 pt-8 md:px-9">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-stroke bg-alabaster px-2.5 py-1 text-xs font-semibold text-black dark:border-strokedark dark:bg-blackho dark:text-white">
                    {isPublished ? 'Billets ouverts' : 'Bientôt disponible'}
                  </span>
                  {event.location && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-alabaster px-2.5 py-1 text-xs font-semibold text-black dark:border-strokedark dark:bg-blackho dark:text-white">
                      <MapPin className="size-3" /> {event.location}
                    </span>
                  )}
                </div>
              </div>

              {event.description && (
                <p className="max-w-150 whitespace-pre-line px-6 pb-2 pt-4 text-[15px] leading-relaxed text-waterloo dark:text-manatee md:px-9">
                  {event.description}
                </p>
              )}

              <div className="flex flex-wrap gap-5 px-6 py-4 text-sm md:px-9">
                <div className="flex items-center gap-2">
                  <CalendarDays className="text-accent-terracotta dark:text-accent-terracotta-dark size-4" />
                  <span>{formattedDate}</span>
                </div>
              </div>

              <div className="mx-6 border-t border-stroke dark:border-strokedark md:mx-9" />

              {/* Billets */}
              <div className="flex flex-col gap-3 px-6 py-8 md:px-9">
                <div className="mb-1 text-xs font-bold uppercase tracking-[0.04em] text-manatee dark:text-waterloo">
                  Billets
                </div>
                {event.tickets.length === 0 ? (
                  <div className="rounded-xl border border-stroke p-6 text-center text-sm text-muted-foreground dark:border-strokedark">
                    Aucun billet en vente pour le moment.
                  </div>
                ) : (
                  event.tickets.map((ticket, index) => {
                    const available = ticket.stock - ticket.stockSold;
                    const soldOut = available <= 0;
                    const highlighted = index === 0 && !soldOut;
                    return (
                      <div
                        key={ticket.id}
                        className={`flex items-center justify-between gap-4 rounded-xl border p-5 ${
                          soldOut ? 'opacity-50' : ''
                        } ${
                          highlighted
                            ? 'border-black dark:border-white'
                            : 'border-stroke dark:border-strokedark'
                        }`}
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
                            <BuyButton
                              slug={slug}
                              ticketId={ticket.id}
                              highlighted={highlighted}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <ResumeCheckout slug={slug} resume={resume === '1'} orderId={orderId} />
    </main>
  );
}

/** Bouton client qui déclenche l'OAuth avec intent d'achat horodaté. */
function BuyButton({
  slug,
  ticketId,
  highlighted,
}: {
  slug: string;
  ticketId: string;
  highlighted: boolean;
}) {
  return (
    <a
      href={`/api/buy-redirect?slug=${encodeURIComponent(slug)}&ticketId=${ticketId}`}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
        highlighted
          ? 'bg-primary text-primary-foreground hover:bg-primaryho'
          : 'border border-stroke text-black hover:border-black dark:border-strokedark dark:text-white dark:hover:border-white'
      }`}
    >
      Acheter
    </a>
  );
}
