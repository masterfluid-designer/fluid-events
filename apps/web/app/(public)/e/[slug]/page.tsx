import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, MapPin, ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { ResumeCheckout } from './resume-checkout';

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
  coverImageUrl: string | null;
  tickets: Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    stock: number;
    stockSold: number;
  }>;
}

async function fetchEvent(slug: string): Promise<EventDetail | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
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
  searchParams: Promise<{ resume?: string }>;
}) {
  const { slug } = await params;
  const { resume } = await searchParams;
  const event = await fetchEvent(slug);
  if (!event) notFound();

  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(event.startDate));

  const isPublished = event.status === 'PUBLISHED';

  return (
    <main className="min-h-svh bg-alabaster dark:bg-blackho">
      <div className="mx-auto max-w-190 px-4 py-8 md:px-8">
        <div className="overflow-hidden rounded-2xl border border-stroke bg-white shadow-solid-2 dark:border-strokedark dark:bg-blacksection">
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
            <Link
              href="/"
              className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-black backdrop-blur"
            >
              <ArrowLeft className="size-3.5" /> Retour
            </Link>
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
        </div>
      </div>
      <ResumeCheckout slug={slug} resume={resume === '1'} />
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
