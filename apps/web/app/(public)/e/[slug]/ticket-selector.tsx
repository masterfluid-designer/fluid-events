'use client';

import { useMemo, useState } from 'react';
import { Check, Minus, Plus, Ticket } from 'lucide-react';
import { CHECKOUT_RESUME_EVENT, openGoogleAuthPopup } from '@/lib/auth';
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
  const [authPending, setAuthPending] = useState(false);

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

  /**
   * Bascule la sélection d’un billet (décision produit 2026-08-17) : premier
   * clic = une place et l’incrémenteur apparaît, second clic = retour à zéro
   * et il disparaît. Déselectionner remet bien la quantité à 0 : garder des
   * places dans un panier dont le compteur est masqué serait un piège.
   */
  function toggleTicket(ticketId: string, max: number) {
    setQuantities((prev) => ({ ...prev, [ticketId]: (prev[ticketId] ?? 0) > 0 ? 0 : Math.min(1, max) }));
  }

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

  // Le récapitulatif se construit depuis `tickets` COMPLET, jamais
  // `visibleTickets` : le panier reste cumulé sur tous les jours, une ligne
  // choisie sous un autre onglet doit rester visible — sinon le total
  // afficherait un montant que rien à l’écran ne justifie.
  const cartLines = cartItems.flatMap((item) => {
    const ticket = tickets.find((t) => t.id === item.ticketId);
    if (!ticket) return [];
    return [{ ticket, quantity: item.quantity, subtotal: Number(ticket.price) * item.quantity }];
  });

  // L'achat exige une connexion (RULES.md — jamais de commande anonyme), mais
  // elle se fait désormais dans une pop-up : cet onglet, et donc le panier
  // sélectionné, ne bougent pas. En cas de succès, `ResumeCheckout` prend le
  // relais via CHECKOUT_RESUME_EVENT.
  async function handleContinue() {
    setAuthPending(true);
    try {
      const authenticated = await openGoogleAuthPopup(slug, cartItems);
      if (authenticated) {
        window.dispatchEvent(new CustomEvent(CHECKOUT_RESUME_EVENT));
      }
    } finally {
      setAuthPending(false);
    }
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
                  : 'border border-stroke text-manatee hover:border-black dark:border-strokedark dark:text-manatee dark:hover:border-white'
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
            // Sélectionné == au moins une place : pas d’état parallèle à tenir
            // synchronisé avec le panier, donc pas de désynchronisation possible.
            const selected = quantity > 0;
            const maxSelectable = Math.min(available, ticket.maxPerOrder || available);
            const hasPromo =
              ticket.compareAtPrice != null && Number(ticket.compareAtPrice) > Number(ticket.price);

            return (
              <div
                key={ticket.id}
                className={`relative overflow-hidden rounded-3xl border transition-colors ${
                  soldOut ? 'opacity-60' : ''
                } ${
                  selected
                    ? 'border-primary ring-1 ring-primary'
                    : highlighted
                      ? 'border-black dark:border-white'
                      : 'border-stroke dark:border-strokedark'
                }`}
              >
                {soldOut && (
                  <div className="pointer-events-none absolute -right-14 top-6 z-10 w-48 rotate-45 bg-destructive py-1.5 text-center text-xs font-bold uppercase tracking-[0.15em] text-white">
                    Sold out
                  </div>
                )}

                {/*
                  La carte entière sélectionne le billet (décision produit
                  2026-08-17) : un clic ajoute une place et dévoile
                  l'incrémenteur, un second clic déselectionne et le referme.
                  Plusieurs billets peuvent être sélectionnés en même temps.

                  L'en-tête est un <button> et l'incrémenteur vit EN DEHORS :
                  imbriquer des boutons dans un bouton est invalide, et casse
                  la navigation clavier.
                */}
                <button
                  type="button"
                  onClick={() => toggleTicket(ticket.id, maxSelectable)}
                  disabled={soldOut || !isPublished}
                  aria-pressed={selected}
                  aria-expanded={selected}
                  className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 p-6 text-left disabled:cursor-not-allowed md:flex-nowrap md:p-8"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1.5">
                    <h3 className="font-event text-xl md:text-2xl">{ticket.name}</h3>
                    {hasPromo && !soldOut && (
                      <span className="rounded-full bg-accent-terracotta px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-accent-terracotta-dark dark:text-black">
                        Promo
                      </span>
                    )}
                    {highlighted && !hasPromo && (
                      <span className="rounded-full border border-stroke px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-manatee dark:border-strokedark dark:text-manatee">
                        Le plus choisi
                      </span>
                    )}
                    {/* Indications sur la même ligne que le nom : description
                        puis places restantes, tronquées plutôt que de pousser
                        le prix à la ligne. */}
                    {ticket.description && (
                      <span className="min-w-0 truncate text-sm text-waterloo dark:text-manatee">
                        {ticket.description}
                      </span>
                    )}
                    <span className="text-xs font-medium text-waterloo dark:text-manatee">
                      {soldOut
                        ? 'Épuisé'
                        : `${available} place${available > 1 ? 's' : ''} restante${available > 1 ? 's' : ''}`}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      {hasPromo && (
                        <div className="text-sm font-medium text-manatee line-through dark:text-manatee">
                          {formatCurrency(Number(ticket.compareAtPrice), ticket.currency)}
                        </div>
                      )}
                      <div className="font-event text-2xl leading-none md:text-3xl">
                        {formatCurrency(Number(ticket.price), ticket.currency)}
                      </div>
                      <div className="mt-1 text-[11px] text-waterloo dark:text-manatee">/ personne</div>
                    </div>

                    {soldOut || !isPublished ? (
                      <span className="rounded-full border border-stroke px-4 py-2 text-xs font-semibold text-manatee dark:border-strokedark">
                        Indisponible
                      </span>
                    ) : (
                      // Pastille d'état : indique que la carte est cliquable et
                      // si elle est retenue, sans occuper la place d'un bouton.
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-stroke text-manatee dark:border-strokedark dark:text-manatee'
                        }`}
                      >
                        {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
                      </span>
                    )}
                  </div>
                </button>

                {selected && !soldOut && isPublished && (
                  <div className="flex items-center justify-between gap-4 border-t border-stroke px-6 py-4 dark:border-strokedark md:px-8">
                    <span className="text-xs font-medium text-waterloo dark:text-manatee">
                      Combien de places ?
                    </span>
                    <div className="flex items-center gap-1 rounded-full border border-stroke dark:border-strokedark">
                      <button
                        type="button"
                        aria-label={`Retirer un billet ${ticket.name}`}
                        onClick={() => updateQuantity(ticket.id, -1, maxSelectable)}
                        className="flex size-10 items-center justify-center rounded-full text-manatee transition-colors hover:text-black dark:text-manatee dark:hover:text-white"
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalQuantity > 0 && (
        <div className="sticky bottom-4 z-30 mt-6 rounded-3xl border border-stroke bg-white/95 p-5 shadow-solid-2 backdrop-blur dark:border-strokedark dark:bg-blacksection/95 md:p-6">
          <div className="text-[11px] font-bold uppercase tracking-wide text-waterloo dark:text-manatee md:text-xs">
            Récapitulatif
          </div>

          {/* Plafonné en hauteur : un panier de nombreux types de billets ne
              doit pas pousser le bouton Payer hors de l’écran sur mobile. */}
          <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto md:max-h-56">
            {cartLines.map(({ ticket, quantity, subtotal }) => (
              <li key={ticket.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-semibold tabular-nums">{quantity}×</span> {ticket.name}
                  {ticket.dayLabel && (
                    <span className="ml-1.5 text-xs text-waterloo dark:text-manatee">
                      ({ticket.dayLabel})
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(subtotal, currency)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-4 border-t border-stroke pt-4 dark:border-strokedark">
            <div className="min-w-0">
              <div className="font-event text-lg leading-none md:text-2xl">
                {formatCurrency(totalAmount, currency)}
              </div>
              <div className="mt-1 text-[11px] text-waterloo dark:text-manatee md:text-xs">
                {totalQuantity} billet{totalQuantity > 1 ? 's' : ''} sélectionné
                {totalQuantity > 1 ? 's' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={handleContinue}
              disabled={authPending}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho disabled:opacity-60 md:px-8"
            >
              {authPending ? 'Connexion...' : 'Payer'} <Ticket className="size-4" />
            </button>
          </div>
        </div>
      )}
    </SectionShell>
  );
}
