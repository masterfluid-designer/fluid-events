'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, Ticket } from 'lucide-react';
import { SectionShell, SectionHeading } from './section-shell';

/**
 * TicketSelector — Panier multi-billets (décision produit "panier
 * multi-billets", cf. plan). Remplace l'ancien BuyButton unitaire : plusieurs
 * types de billets et quantités peuvent être sélectionnés avant un unique
 * paiement. Utilisé à la fois par le rendu Builder (bloc `tickets`, voir
 * block-renderer.tsx) et le rendu de repli (page.tsx) — c'était auparavant
 * deux implémentations quasi identiques, maintenant unifiées ici.
 *
 * La sélection ne fait AUCUN appel serveur — le panier n'est validé (stock,
 * fenêtre de vente, maxPerOrder) que côté API à `POST /api/payments/init`
 * (RULES.md §1 : la sécurité/les décisions vivent dans NestJS). Le cap
 * `maxPerOrder` côté client n'est qu'un confort UX, jamais une garantie.
 *
 * `dayLabel` (regroupement multi-jours) : si au moins un billet en porte un,
 * des onglets par jour apparaissent — la sélection reste cumulée sur TOUS les
 * jours (changer d'onglet ne vide pas le panier), un seul paiement couvre
 * l'ensemble.
 */

export interface PublicTicket {
  id: string;
  name: string;
  price: number;
  currency: string;
  stock: number;
  stockSold: number;
  maxPerOrder: number;
  description?: string | null;
  compareAtPrice?: number | null;
  promoEndsAt?: string | null;
  dayLabel?: string | null;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
}

export function TicketSelector({
  tickets,
  slug,
  isPublished,
}: {
  tickets: PublicTicket[];
  slug: string;
  isPublished: boolean;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const days = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.dayLabel).filter((d): d is string => Boolean(d)))),
    [tickets],
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const activeDay = selectedDay ?? days[0] ?? null;
  const visibleTickets = days.length > 0 ? tickets.filter((t) => t.dayLabel === activeDay) : tickets;

  const now = Date.now();
  const activePromo = tickets.find(
    (t) =>
      t.promoEndsAt &&
      new Date(t.promoEndsAt).getTime() > now &&
      t.compareAtPrice != null &&
      Number(t.compareAtPrice) > Number(t.price),
  );

  function updateQuantity(ticketId: string, delta: number, max: number) {
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(max, (prev[ticketId] ?? 0) + delta));
      return { ...prev, [ticketId]: next };
    });
  }

  const cartItems = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([ticketId, quantity]) => ({ ticketId, quantity }));
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => {
    const ticket = tickets.find((t) => t.id === item.ticketId);
    return sum + (ticket ? Number(ticket.price) * item.quantity : 0);
  }, 0);
  const currency = tickets[0]?.currency ?? 'XOF';

  function handleContinue() {
    const encoded = encodeURIComponent(JSON.stringify(cartItems));
    window.location.href = `/api/buy-redirect?slug=${encodeURIComponent(slug)}&items=${encoded}`;
  }

  return (
    <SectionShell>
      <SectionHeading
        eyebrow="Billetterie"
        title="Choisissez votre expérience"
        description="Réservation 100% en ligne, billet numérique à présenter à l'entrée."
      />

      {activePromo && (
        <div className="mb-6 rounded-2xl border border-accent-terracotta/40 bg-accent-terracotta/10 px-5 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-accent-terracotta dark:border-accent-terracotta-dark/40 dark:text-accent-terracotta-dark md:text-sm">
          Prévente : réductions jusqu&apos;au{' '}
          {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(activePromo.promoEndsAt!))}
        </div>
      )}

      {days.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2.5">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                day === activeDay
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-stroke text-manatee hover:border-black dark:border-strokedark dark:text-waterloo dark:hover:border-white'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-stroke p-10 text-center text-sm text-muted-foreground dark:border-strokedark">
          Aucun billet en vente pour le moment.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleTickets.map((ticket, index) => {
            const available = ticket.stock - ticket.stockSold;
            const soldOut = available <= 0;
            const highlighted = index === 0 && !soldOut;
            const quantity = quantities[ticket.id] ?? 0;
            const maxSelectable = Math.min(available, ticket.maxPerOrder || available);
            const hasPromo =
              ticket.compareAtPrice != null && Number(ticket.compareAtPrice) > Number(ticket.price);

            return (
              <div
                key={ticket.id}
                className={`relative flex flex-col gap-5 overflow-hidden rounded-3xl border p-6 transition-colors md:flex-row md:items-center md:justify-between md:gap-8 md:p-8 ${
                  soldOut ? 'opacity-60' : ''
                } ${highlighted ? 'border-black dark:border-white' : 'border-stroke dark:border-strokedark'}`}
              >
                {soldOut && (
                  <div className="pointer-events-none absolute -right-14 top-6 w-48 rotate-45 bg-destructive py-1.5 text-center text-xs font-bold uppercase tracking-[0.15em] text-white">
                    Sold out
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-serif text-xl md:text-2xl">{ticket.name}</h3>
                    {hasPromo && !soldOut && (
                      <span className="rounded-full bg-accent-terracotta px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-accent-terracotta-dark">
                        Promo
                      </span>
                    )}
                    {highlighted && !hasPromo && (
                      <span className="rounded-full border border-stroke px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-manatee dark:border-strokedark dark:text-waterloo">
                        Le plus choisi
                      </span>
                    )}
                  </div>
                  {ticket.description && (
                    <p className="mt-1.5 max-w-md text-sm text-waterloo dark:text-manatee">
                      {ticket.description}
                    </p>
                  )}
                  <div className="mt-2 text-xs font-medium text-manatee dark:text-waterloo">
                    {soldOut
                      ? 'Épuisé — la vente est terminée'
                      : `${available} place${available > 1 ? 's' : ''} restante${available > 1 ? 's' : ''}`}
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-5 md:justify-end md:gap-7">
                  <div className="text-left md:text-right">
                    {hasPromo && (
                      <div className="text-sm font-medium text-manatee line-through dark:text-waterloo">
                        {formatCurrency(Number(ticket.compareAtPrice), ticket.currency)}
                      </div>
                    )}
                    <div className="font-serif text-2xl leading-none md:text-3xl">
                      {formatCurrency(Number(ticket.price), ticket.currency)}
                    </div>
                    <div className="mt-1 text-[11px] text-manatee dark:text-waterloo">/ personne</div>
                  </div>

                  {soldOut || !isPublished ? (
                    <span className="rounded-full border border-stroke px-5 py-2.5 text-sm font-semibold text-manatee dark:border-strokedark">
                      Indisponible
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 rounded-full border border-stroke dark:border-strokedark">
                      <button
                        type="button"
                        aria-label={`Retirer un billet ${ticket.name}`}
                        onClick={() => updateQuantity(ticket.id, -1, maxSelectable)}
                        disabled={quantity === 0}
                        className="flex size-10 items-center justify-center rounded-full text-manatee transition-colors hover:text-black disabled:opacity-30 dark:text-waterloo dark:hover:text-white"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-6 text-center font-semibold tabular-nums">{quantity}</span>
                      <button
                        type="button"
                        aria-label={`Ajouter un billet ${ticket.name}`}
                        onClick={() => updateQuantity(ticket.id, 1, maxSelectable)}
                        disabled={quantity >= maxSelectable}
                        className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalQuantity > 0 && (
        <div className="sticky bottom-4 z-30 mt-6 flex items-center justify-between gap-4 rounded-full border border-stroke bg-white/95 px-5 py-3 shadow-solid-2 backdrop-blur dark:border-strokedark dark:bg-blacksection/95 md:px-7 md:py-4">
          <div className="min-w-0">
            <div className="font-serif text-lg leading-none md:text-2xl">
              {formatCurrency(totalAmount, currency)}
            </div>
            <div className="mt-1 text-[11px] text-manatee dark:text-waterloo md:text-xs">
              {totalQuantity} billet{totalQuantity > 1 ? 's' : ''} sélectionné
              {totalQuantity > 1 ? 's' : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={handleContinue}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho md:px-8"
          >
            Continuer <Ticket className="size-4" />
          </button>
        </div>
      )}
    </SectionShell>
  );
}
