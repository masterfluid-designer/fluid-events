'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * TicketSelector — Panier multi-billets (décision produit "panier
 * multi-billets", cf. plan). Remplace l'ancien BuyButton unitaire : plusieurs
 * types de billets et quantités peuvent être sélectionnés avant un unique
 * paiement. Utilisé à la fois par le rendu Builder (bloc `tickets`, voir
 * block-renderer.tsx) et le rendu fallback (page.tsx) — c'était auparavant
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
    <div className="flex flex-col gap-3 px-6 py-8 md:px-9">
      <div className="mb-1 text-xs font-bold uppercase tracking-[0.04em] text-manatee dark:text-waterloo">
        Billets
      </div>

      {activePromo && (
        <div className="mb-1 rounded-lg border border-accent-terracotta/40 bg-accent-terracotta/10 px-4 py-2.5 text-center text-xs font-semibold text-accent-terracotta dark:border-accent-terracotta-dark/40 dark:text-accent-terracotta-dark">
          Promo jusqu'au{' '}
          {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(activePromo.promoEndsAt!))}
        </div>
      )}

      {days.length > 0 && (
        <div className="mb-1 flex gap-2">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
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
        <div className="rounded-xl border border-stroke p-6 text-center text-sm text-muted-foreground dark:border-strokedark">
          Aucun billet en vente pour le moment.
        </div>
      ) : (
        visibleTickets.map((ticket, index) => {
          const available = ticket.stock - ticket.stockSold;
          const soldOut = available <= 0;
          const highlighted = index === 0 && !soldOut;
          const quantity = quantities[ticket.id] ?? 0;
          const maxSelectable = Math.min(available, ticket.maxPerOrder || available);
          const hasPromo = ticket.compareAtPrice != null && Number(ticket.compareAtPrice) > Number(ticket.price);

          return (
            <div
              key={ticket.id}
              className={`relative flex items-center justify-between gap-4 overflow-hidden rounded-xl border p-5 ${
                soldOut ? 'opacity-60' : ''
              } ${highlighted ? 'border-black dark:border-white' : 'border-stroke dark:border-strokedark'}`}
            >
              {soldOut && (
                <div className="pointer-events-none absolute -right-11 top-3.5 w-40 rotate-45 bg-destructive py-1 text-center text-[10px] font-bold uppercase tracking-wider text-white">
                  Épuisé
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{ticket.name}</span>
                  {hasPromo && !soldOut && (
                    <span className="rounded-full bg-accent-terracotta px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-accent-terracotta-dark">
                      Promo
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-manatee dark:text-waterloo">
                  {soldOut
                    ? 'Épuisé'
                    : `${available} place${available > 1 ? 's' : ''} restante${available > 1 ? 's' : ''}`}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  {hasPromo && (
                    <div className="text-xs font-medium text-manatee line-through dark:text-waterloo">
                      {formatCurrency(Number(ticket.compareAtPrice), ticket.currency)}
                    </div>
                  )}
                  <div className="font-bold">{formatCurrency(Number(ticket.price), ticket.currency)}</div>
                </div>
                {soldOut || !isPublished ? (
                  <span className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-semibold text-manatee dark:border-strokedark">
                    Indisponible
                  </span>
                ) : (
                  <div className="flex items-center gap-1 rounded-full border border-stroke dark:border-strokedark">
                    <button
                      type="button"
                      aria-label={`Retirer un billet ${ticket.name}`}
                      onClick={() => updateQuantity(ticket.id, -1, maxSelectable)}
                      disabled={quantity === 0}
                      className="flex size-8 items-center justify-center rounded-full text-manatee transition-colors hover:text-black disabled:opacity-30 dark:text-waterloo dark:hover:text-white"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                    <button
                      type="button"
                      aria-label={`Ajouter un billet ${ticket.name}`}
                      onClick={() => updateQuantity(ticket.id, 1, maxSelectable)}
                      disabled={quantity >= maxSelectable}
                      className="flex size-8 items-center justify-center rounded-full text-manatee transition-colors hover:text-black disabled:opacity-30 dark:text-waterloo dark:hover:text-white"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {totalQuantity > 0 && (
        <div className="sticky bottom-4 z-10 mt-2 flex items-center justify-between gap-4 rounded-full border border-stroke bg-white/95 px-5 py-3 shadow-solid-2 backdrop-blur dark:border-strokedark dark:bg-blacksection/95">
          <div className="text-sm">
            <span className="font-bold">{formatCurrency(totalAmount, currency)}</span>
            <span className="ml-1.5 text-manatee dark:text-waterloo">
              · {totalQuantity} billet{totalQuantity > 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={handleContinue}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho"
          >
            Continuer
          </button>
        </div>
      )}
    </div>
  );
}
