import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, MapPin, Ticket, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Metadata } from 'next';

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await fetchEvent(slug);
  if (!event) notFound();

  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(event.startDate));

  const isPublished = event.status === 'PUBLISHED';

  return (
    <main className="min-h-svh bg-background">
      {/* Cover */}
      <div className="relative h-64 w-full bg-gradient-to-br from-primary/80 to-primary/40 md:h-80">
        {event.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverImageUrl}
            alt={event.title}
            className="size-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute left-4 top-4">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" /> Retour
            </Link>
          </Button>
        </div>
      </div>

      <div className="container mx-auto -mt-12 px-4 pb-20">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Infos principales */}
          <div className="space-y-6 md:col-span-2">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant={isPublished ? 'success' : 'secondary'}>
                  {isPublished ? '● Billets ouverts' : 'Bientôt disponible'}
                </Badge>
              </div>
              <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
                {event.title}
              </h1>
              {event.description && (
                <p className="mt-4 whitespace-pre-line text-muted-foreground">
                  {event.description}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                <span>{formattedDate}</span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  <span>{event.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Billets */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Ticket className="size-4" /> Billets disponibles
            </h2>
            {event.tickets.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Aucun billet en vente pour le moment.
                </CardContent>
              </Card>
            ) : (
              event.tickets.map((ticket) => {
                const available = ticket.stock - ticket.stockSold;
                const soldOut = available <= 0;
                return (
                  <Card key={ticket.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span>{ticket.name}</span>
                        <span className="text-primary">
                          {new Intl.NumberFormat('fr-FR', {
                            style: 'currency',
                            currency: ticket.currency,
                          }).format(Number(ticket.price))}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {soldOut
                            ? 'Épuisé'
                            : `${available} place${available > 1 ? 's' : ''} restante${available > 1 ? 's' : ''}`}
                        </span>
                        {soldOut && <Badge variant="destructive">Épuisé</Badge>}
                      </div>
                      <Button
                        className="w-full"
                        disabled={soldOut || !isPublished}
                        asChild={!soldOut && isPublished ? true : undefined}
                      >
                        {soldOut || !isPublished ? (
                          <span>Indisponible</span>
                        ) : (
                          <BuyButton slug={slug} ticketId={ticket.id} />
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Bouton client qui déclenche l'OAuth avec intent d'achat horodaté. */
function BuyButton({ slug, ticketId }: { slug: string; ticketId: string }) {
  return (
    <a
      href={`/api/buy-redirect?slug=${encodeURIComponent(slug)}&ticketId=${ticketId}`}
    >
      Acheter ce billet
    </a>
  );
}
