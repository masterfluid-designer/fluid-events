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
  // Fenêtre de vente (2026-08-18). L'API la faisait déjà respecter à
  // `POST /api/payments/init` ; la page, elle, proposait le billet comme
  // n'importe quel autre — l'acheteur ne l'apprenait qu'après avoir payé
  // de son attention. Ces bornes ne sont qu'un affichage : la garde reste
  // côté serveur, comme pour maxPerOrder.
  saleStartDate?: string | null;
  saleEndDate?: string | null;
  dayLabel?: string | null;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
}

/** Date d'ouverture des ventes, lisible dans la ligne d'indications. */
function formatSaleDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/**
 * Un `dayLabel` est saisi d'un bloc par l'organisateur (« Jour 1 — Samedi 8
 * Août »). L'onglet, lui, se lit mieux sur deux lignes : le rang en gras, la
 * date en sous-titre. On coupe sur le tiret cadratin, et à défaut on garde le
 * libellé entier sur une seule ligne — jamais de découpe hasardeuse.
 */
function splitDayLabel(label: string): { title: string; subtitle: string | null } {
  const [title, ...rest] = label.split('—');
  if (rest.length === 0) return { title: label.trim(), subtitle: null };
  return { title: title.trim(), subtitle: rest.join('—').trim() || null };
}

/** Un billet est épuisé quand il ne reste aucune place. */
function isSoldOut(ticket: PublicTicket): boolean {
  return ticket.stock - ticket.stockSold <= 0;
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
  // Un billet SANS journée n'appartient à aucun onglet — il ne doit pas pour
  // autant disparaître (bug constaté le 2026-08-18 : le filtre `=== activeDay`
  // escamotait purement et simplement « Backstage Pass » et tout billet non
  // étiqueté dès qu'UN SEUL billet portait un `dayLabel`, sans le moindre
  // signal à l'organisateur). Ces billets restent donc visibles sous chaque
  // onglet : mieux vaut les montrer partout que les perdre.
  const visibleTickets =
    days.length > 0 ? tickets.filter((t) => !t.dayLabel || t.dayLabel === activeDay) : tickets;

  /**
   * Une journée est épuisée quand TOUS ses billets datés le sont. Les billets
   * non datés (visibles sous chaque onglet) n'entrent pas dans le calcul :
   * ils n'appartiennent à aucune journée, ils ne peuvent donc pas décider de
   * l'état de l'une d'elles.
   */
  const soldOutDays = useMemo(() => {
    const result = new Set<string>();
    for (const day of days) {
      const ofDay = tickets.filter((t) => t.dayLabel === day);
      if (ofDay.length > 0 && ofDay.every(isSoldOut)) result.add(day);
    }
    return result;
  }, [days, tickets]);

  // Le bandeau d'épuisement annonce ce que le visiteur a SOUS LES YEUX : la
  // journée ouverte s'il y a des onglets, sinon la billetterie entière.
  const currentIsSoldOut =
    days.length > 0
      ? activeDay !== null && soldOutDays.has(activeDay)
      : tickets.length > 0 && tickets.every(isSoldOut);

  // Un seul instant de référence pour le composant : bannière promo ET
  // fenêtres de vente des cartes.
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
          {days.map((day) => {
            const { title, subtitle } = splitDayLabel(day);
            const active = day === activeDay;
            const daySoldOut = soldOutDays.has(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                // L'état d'épuisement est porté par l'onglet LUI-MÊME, pas
                // seulement par les cartes en dessous : le visiteur doit
                // pouvoir renoncer à une journée sans avoir à la parcourir.
                className={`rounded-2xl px-5 py-2.5 text-left transition-colors ${
                  daySoldOut
                    ? active
                      ? 'bg-soldout text-white'
                      : 'border border-soldout/40 text-soldout hover:border-soldout'
                    : active
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-stroke text-manatee hover:border-black dark:border-strokedark dark:text-manatee dark:hover:border-white'
                }`}
              >
                <span className="block text-sm font-bold leading-tight">{title}</span>
                {daySoldOut ? (
                  <span
                    className={`mt-0.5 block text-[11px] font-bold uppercase tracking-[0.12em] ${
                      active ? 'opacity-90' : ''
                    }`}
                  >
                    Sold out
                  </span>
                ) : (
                  subtitle && (
                    <span className="mt-0.5 block text-[11px] font-medium opacity-70">
                      {subtitle}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      )}

      {/*
        Bandeau d'épuisement — niveau intermédiaire entre l'onglet et la carte.
        Sans lui, un visiteur qui arrive directement sur une journée complète ne
        comprend l'échec qu'après avoir lu chaque carte une par une.
      */}
      {currentIsSoldOut && (
        // Fond SOMBRE et non un voile rouge : le rouge doit rester l'encre du
        // message, pas la couleur du panneau. Un panneau rose pâle avec du
        // texte rouge dessus perd le contraste qui fait tout l'effet.
        <div className="mb-6 rounded-3xl border-2 border-soldout bg-black/85 px-6 py-8 text-center [box-shadow:0_0_28px_-6px_var(--color-soldout)]">
          <div className="animate-sold-out-blink font-event text-4xl font-black uppercase leading-none tracking-[0.18em] text-soldout [text-shadow:0_0_26px_color-mix(in_oklab,var(--color-soldout)_65%,transparent)] md:text-6xl">
            Sold out
          </div>
          {/* La phrase reste en blanc : c'est elle qui doit se lire vite, et
              du rouge sur rouge la rendrait plus décorative qu'informative. */}
          <p className="mt-3 text-sm font-semibold text-white md:text-base">
            {days.length > 0 && activeDay
              ? `Plus aucune place pour ${splitDayLabel(activeDay).title} — la vente est terminée.`
              : 'Toutes les places ont trouvé preneur — la vente est terminée.'}
          </p>
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
            const notYetOnSale = Boolean(
              ticket.saleStartDate && now < new Date(ticket.saleStartDate).getTime(),
            );
            const saleOver = Boolean(
              ticket.saleEndDate && now > new Date(ticket.saleEndDate).getTime(),
            );
            // Épuisé, pas encore ouvert, clôturé : trois raisons distinctes de
            // ne pas pouvoir acheter, un seul comportement d'interaction.
            const unavailable = soldOut || notYetOnSale || saleOver;
            // …mais pas un seul traitement visuel. Un billet épuisé ou clôturé
            // est un reliquat : on l'éteint. Un billet pas encore ouvert est
            // une PROMESSE — l'éteindre le fait passer pour un déchet alors
            // qu'il faut au contraire donner envie d'y revenir. Il garde donc
            // son contraste plein, et c'est son badge qui porte l'état.
            const dimmed = soldOut || saleOver;
            const highlighted = index === 0 && !unavailable;
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
                  dimmed ? 'border-dashed' : ''
                } ${
                  selected
                    ? 'border-primary ring-1 ring-primary'
                    : highlighted
                      ? 'border-black dark:border-white'
                      : 'border-stroke dark:border-strokedark'
                }`}
              >
                {soldOut && (
                  // Tampon apposé EN TRAVERS de la carte, pas un ruban discret
                  // dans le coin : le refus doit être la première chose lue,
                  // avant le nom et avant le prix. `pointer-events-none` pour
                  // qu'il ne mange pas les clics de la carte en dessous.
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                    <span className="animate-stamp-bounce -rotate-12 rounded-xl border-[3px] border-soldout px-6 py-2 text-3xl font-black uppercase tracking-[0.2em] text-soldout [box-shadow:0_0_30px_-4px_var(--color-soldout)] [text-shadow:0_0_22px_color-mix(in_oklab,var(--color-soldout)_70%,transparent)] md:px-12 md:py-3 md:text-5xl">
                      Sold out
                    </span>
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
                  disabled={unavailable || !isPublished}
                  aria-pressed={selected}
                  aria-expanded={selected}
                  // L'atténuation porte sur le CONTENU, jamais sur le
                  // conteneur : le tampon « Sold out » est son frère, l'affadir
                  // avec le reste reviendrait à effacer le message qu'on veut
                  // justement rendre impossible à manquer.
                  className={`flex w-full flex-wrap items-center gap-x-6 gap-y-2 p-6 text-left disabled:cursor-not-allowed md:flex-nowrap md:p-8 ${
                    dimmed ? 'opacity-45' : ''
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1.5">
                    <h3 className="font-event text-xl md:text-2xl">{ticket.name}</h3>
                    {hasPromo && !unavailable && (
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
                        : notYetOnSale
                          ? `En vente à partir du ${formatSaleDate(ticket.saleStartDate!)}`
                          : saleOver
                            ? 'Ventes clôturées'
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
                      {/* Prix barré quand il n'y a plus rien à vendre : le
                          montant reste lisible (il informe encore sur le
                          niveau de gamme du billet) mais ne se présente plus
                          comme une offre en cours. */}
                      <div
                        className={`font-event text-2xl leading-none md:text-3xl ${
                          soldOut ? 'text-manatee line-through decoration-2' : ''
                        }`}
                      >
                        {formatCurrency(Number(ticket.price), ticket.currency)}
                      </div>
                      <div className="mt-1 text-[11px] text-waterloo dark:text-manatee">/ personne</div>
                    </div>

                    {unavailable || !isPublished ? (
                      // « Bientôt » se distingue des deux autres : c'est le
                      // seul état qui appelle un retour du visiteur, il porte
                      // donc la couleur de l'événement plutôt que le gris des
                      // billets morts.
                      <span
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${
                          notYetOnSale
                            ? 'border border-primary/40 bg-primary/10 text-primary'
                            : 'border border-stroke text-manatee dark:border-strokedark'
                        }`}
                      >
                        {notYetOnSale ? 'Bientôt' : saleOver ? 'Terminé' : 'Indisponible'}
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

                {selected && !unavailable && isPublished && (
                  <div className="flex items-center justify-between gap-4 border-t border-stroke px-6 py-4 dark:border-strokedark md:px-8">
                    <span className="text-xs font-medium text-waterloo dark:text-manatee">
                      {maxSelectable > 1
                        ? "Combien de places ?"
                        : "Une place par commande pour ce billet"}
                    </span>
                    {maxSelectable > 1 && (
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
                    )}
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
