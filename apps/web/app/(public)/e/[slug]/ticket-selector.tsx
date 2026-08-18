'use client';

import { useMemo, useState } from 'react';
import { Check, MessageCircle, Minus, Plus, Sparkles, Ticket } from 'lucide-react';
import type { TicketSaleMode } from '@saas-events/types';
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
 *
 * Mise en page (refonte 2026-08-18) : DEUX colonnes sur grand écran, la liste
 * à gauche et le récapitulatif à droite — ce dernier étant visible dès l'état
 * vide. Il portait auparavant le seul bouton d'achat ET la seule mention de
 * sécurité du paiement, mais n'apparaissait qu'APRÈS une première sélection :
 * la réassurance arrivait donc après la décision, quand elle ne sert plus à
 * rien. Sous `lg`, la grille s'empile et le récapitulatif redevient une barre
 * collante en bas d'écran, où une colonne latérale n'aurait aucun sens.
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
  /** Rang d'affichage (« Pass individuel », « Pass groupe »…). */
  category?: string | null;
  /** Bénéfices inclus, affichés en puces cochées (2026-08-18). */
  features?: string[] | null;
  /**
   * `ON_REQUEST` : formule négociée hors ligne (table, package groupe). Elle
   * s'affiche mais ne s'achète pas ici — l'API la refuse au panier, cet
   * affichage n'est que la moitié visible de la règle.
   */
  saleMode?: TicketSaleMode | null;
  /** Pastille de qualification d'une formule sur demande. */
  requestBadge?: string | null;
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

/**
 * Une formule sur demande ne s'achète pas ici — elle n'a donc pas de stock qui
 * veuille dire quelque chose. L'exclure des calculs d'épuisement évite qu'une
 * table négociée, créée à stock zéro, déclare toute une journée complète.
 */
function isOnRequest(ticket: PublicTicket): boolean {
  return ticket.saleMode === 'ON_REQUEST';
}

/**
 * Regroupe les billets par `category` en conservant l'ordre d'apparition —
 * c'est-à-dire l'ordre de prix décidé par l'API, pas un tri alphabétique qui
 * mettrait « Pass groupe » avant « Pass individuel » sans raison.
 *
 * Les billets sans catégorie forment un rang anonyme, rendu SANS en-tête :
 * inventer un libellé (« Autres ») pour un organisateur qui n'a rien saisi
 * reviendrait à écrire à sa place sur sa propre page.
 */
function groupByCategory(tickets: PublicTicket[]): Array<{ label: string | null; tickets: PublicTicket[] }> {
  const groups: Array<{ label: string | null; tickets: PublicTicket[] }> = [];
  for (const ticket of tickets) {
    const label = ticket.category?.trim() || null;
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.tickets.push(ticket);
    else groups.push({ label, tickets: [ticket] });
  }
  return groups;
}

/**
 * Frise des quatre étapes du tunnel. Purement indicative ici : la section
 * billetterie est toujours l'étape 1, les suivantes se déroulent dans la
 * pop-up d'authentification puis chez le prestataire de paiement.
 *
 * Elle ne décore pas : elle répond aux deux questions que se pose tout
 * acheteur avant de cliquer — combien d'étapes, et est-ce que je paie
 * maintenant. Sans elle, on passait d'une carte de billet à une pop-up Google
 * sans le moindre préavis.
 */
const CHECKOUT_STEPS = ['Billets', 'Vos infos', 'Paiement', 'Confirmation'];

function CheckoutStepper() {
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 md:mb-10 md:gap-x-4">
      {CHECKOUT_STEPS.map((label, index) => {
        const current = index === 0;
        return (
          <li key={label} className="flex items-center gap-3 md:gap-4">
            <span className="flex items-center gap-2">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                  current
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-stroke text-manatee dark:border-strokedark'
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`text-sm ${
                  current ? 'font-bold' : 'font-medium text-waterloo dark:text-manatee'
                }`}
              >
                {label}
              </span>
            </span>
            {/* Le trait de liaison appartient à l'étape qui le précède, et
                disparaît après la dernière — un trait orphelin en fin de frise
                laisserait croire à une cinquième étape masquée. */}
            {index < CHECKOUT_STEPS.length - 1 && (
              <span aria-hidden="true" className="hidden h-px w-8 bg-stroke dark:bg-strokedark sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function TicketSelector({
  tickets,
  slug,
  isPublished,
  contactPhone,
}: {
  tickets: PublicTicket[];
  slug: string;
  isPublished: boolean;
  /** Numéro de l'événement — seul canal des formules sur demande. */
  contactPhone?: string | null;
}) {
  // wa.me attend le numéro international SANS « + » ni séparateurs. Le champ
  // est validé en E.164 à l'écriture, mais on nettoie quand même : un espace
  // suffirait à produire un lien qui n'ouvre rien (même garde que le bloc Accès).
  const whatsappNumber = contactPhone?.replace(/[^0-9]/g, '') || null;
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
      const ofDay = tickets.filter((t) => t.dayLabel === day && !isOnRequest(t));
      if (ofDay.length > 0 && ofDay.every(isSoldOut)) result.add(day);
    }
    return result;
  }, [days, tickets]);

  // Le bandeau d'épuisement annonce ce que le visiteur a SOUS LES YEUX : la
  // journée ouverte s'il y a des onglets, sinon la billetterie entière.
  const onlineTickets = tickets.filter((t) => !isOnRequest(t));
  const currentIsSoldOut =
    days.length > 0
      ? activeDay !== null && soldOutDays.has(activeDay)
      : onlineTickets.length > 0 && onlineTickets.every(isSoldOut);

  const groups = useMemo(() => groupByCategory(visibleTickets), [visibleTickets]);

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

  // Le badge « Le plus choisi » se pose sur le premier billet RÉELLEMENT
  // achetable, et non sur le premier de la liste : le coller sur un billet
  // épuisé le transformerait en regret.
  const highlightedId =
    visibleTickets.find((t) => {
      const notYet = t.saleStartDate && now < new Date(t.saleStartDate).getTime();
      const over = t.saleEndDate && now > new Date(t.saleEndDate).getTime();
      // Une formule négociée n'est pas « la plus choisie » : elle se demande.
      return !isOnRequest(t) && !isSoldOut(t) && !notYet && !over;
    })?.id ?? null;

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

  /** Corps du récapitulatif — même contenu en colonne (lg) et en barre (mobile). */
  const summaryLines =
    cartLines.length === 0 ? (
      // L'état vide est nommé, pas laissé blanc : un panneau vide sans phrase
      // ressemble à un chargement qui n'a pas abouti.
      <p className="text-sm text-waterloo dark:text-manatee">
        Aucun billet sélectionné pour le moment.
      </p>
    ) : (
      // Plafonné en hauteur : un panier de nombreux types de billets ne doit
      // pas pousser le bouton de paiement hors de l’écran.
      <ul className="max-h-44 space-y-2 overflow-y-auto md:max-h-56">
        {cartLines.map(({ ticket, quantity, subtotal }) => (
          <li key={ticket.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-semibold tabular-nums">{quantity}×</span> {ticket.name}
              {ticket.dayLabel && (
                <span className="ml-1.5 text-xs text-waterloo dark:text-manatee">
                  ({splitDayLabel(ticket.dayLabel).title})
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{formatCurrency(subtotal, currency)}</span>
          </li>
        ))}
      </ul>
    );

  const payButton = (
    <button
      type="button"
      onClick={handleContinue}
      // Désactivé plutôt qu'absent : voir le bouton éteint apprend qu'il
      // existe et ce qu'il faut faire pour l'allumer.
      disabled={authPending || totalQuantity === 0 || !isPublished}
      className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho disabled:cursor-not-allowed disabled:opacity-45"
    >
      {authPending ? 'Connexion…' : 'Continuer'} <Ticket className="size-4" />
    </button>
  );

  const reassurance = (
    <p className="mt-3 text-center text-[11px] leading-relaxed text-waterloo dark:text-manatee">
      Paiement sécurisé par mobile money &amp; carte, sans quitter le site.
    </p>
  );

  return (
    <SectionShell>
      <SectionHeading
        eyebrow="Billetterie"
        title="Choisissez votre expérience"
        description="Réservation 100% en ligne, billet numérique à présenter à l'entrée."
      />

      <CheckoutStepper />

      {/* `items-start` : sans lui, la colonne de droite s'étire sur toute la
          hauteur de la liste et `sticky` n'a plus rien à faire coller. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0">
          {activePromo && (
            <div className="mb-6 rounded-2xl border border-accent-terracotta/40 bg-accent-terracotta/10 px-5 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-accent-terracotta dark:border-accent-terracotta-dark/40 dark:text-accent-terracotta-dark md:text-sm">
              Prévente : réductions jusqu&apos;au{' '}
              {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                new Date(activePromo.promoEndsAt!),
              )}
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
            Bandeau d'épuisement — niveau intermédiaire entre l'onglet et la
            carte. Sans lui, un visiteur qui arrive directement sur une journée
            complète ne comprend l'échec qu'après avoir lu chaque carte.
          */}
          {currentIsSoldOut && (
            // Fond SOMBRE et non un voile rouge : le rouge doit rester l'encre
            // du message, pas la couleur du panneau. Un panneau rose pâle avec
            // du texte rouge dessus perd le contraste qui fait tout l'effet.
            <div className="mb-6 rounded-3xl border-2 border-soldout bg-black/85 px-6 py-8 text-center [box-shadow:0_0_28px_-6px_var(--color-soldout)]">
              <div className="animate-sold-out-blink font-event text-4xl font-black uppercase leading-none tracking-[0.18em] text-soldout [text-shadow:0_0_26px_color-mix(in_oklab,var(--color-soldout)_65%,transparent)] md:text-6xl">
                Sold out
              </div>
              {/* La phrase reste en blanc : c'est elle qui doit se lire vite,
                  et du rouge sur rouge la rendrait décorative. */}
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
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <div key={group.label ?? '__sans_rang__'} className="flex flex-col gap-4">
                  {group.label && (
                    // Libellé de rang + filet qui occupe la largeur restante :
                    // il sépare deux familles de billets sans ajouter un titre
                    // de plus dans la hiérarchie de la page.
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-waterloo dark:text-manatee">
                        {group.label}
                      </span>
                      <span aria-hidden="true" className="h-px flex-1 bg-stroke dark:bg-strokedark" />
                    </div>
                  )}

                  {group.tickets.map((ticket) => {
                    const available = ticket.stock - ticket.stockSold;
                    const soldOut = available <= 0;
                    const notYetOnSale = Boolean(
                      ticket.saleStartDate && now < new Date(ticket.saleStartDate).getTime(),
                    );
                    const saleOver = Boolean(
                      ticket.saleEndDate && now > new Date(ticket.saleEndDate).getTime(),
                    );
                    // Épuisé, pas encore ouvert, clôturé : trois raisons
                    // distinctes de ne pas pouvoir acheter, un seul
                    // comportement d'interaction.
                    const unavailable = soldOut || notYetOnSale || saleOver;
                    // …mais pas un seul traitement visuel. Un billet épuisé ou
                    // clôturé est un reliquat : on l'éteint. Un billet pas
                    // encore ouvert est une PROMESSE — l'éteindre le fait
                    // passer pour un déchet alors qu'il faut au contraire
                    // donner envie d'y revenir. Il garde son contraste plein,
                    // et c'est son badge qui porte l'état.
                    const dimmed = soldOut || saleOver;
                    // Formule négociée : elle ignore stock et fenêtre de vente,
                    // qui ne veulent rien dire pour elle. Elle n'est jamais
                    // « indisponible » — elle se demande, c'est tout.
                    const onRequest = isOnRequest(ticket);
                    const highlighted = ticket.id === highlightedId;
                    const quantity = quantities[ticket.id] ?? 0;
                    const selected = quantity > 0;
                    const maxSelectable = Math.min(available, ticket.maxPerOrder || available);
                    const hasPromo =
                      ticket.compareAtPrice != null &&
                      Number(ticket.compareAtPrice) > Number(ticket.price);
                    const features = (ticket.features ?? []).filter((f) => f.trim().length > 0);

                    return (
                      <div
                        key={ticket.id}
                        className={`relative overflow-hidden rounded-3xl border transition-colors ${
                          dimmed && !onRequest ? 'border-dashed' : ''
                        } ${
                          selected
                            ? 'border-primary ring-1 ring-primary'
                            : onRequest
                              ? // Bordure d'accent : une formule sur mesure est
                                // une offre à part, pas un billet parmi
                                // d'autres — elle se distingue avant d'être lue.
                                'border-primary/45'
                              : highlighted
                                ? 'border-black dark:border-white'
                                : 'border-stroke dark:border-strokedark'
                        }`}
                      >
                        {soldOut && !onRequest && (
                          // Tampon apposé EN TRAVERS de la carte, pas un ruban
                          // discret dans le coin : le refus doit être la
                          // première chose lue, avant le nom et le prix.
                          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                            <span className="animate-stamp-bounce -rotate-12 rounded-xl border-[3px] border-soldout px-6 py-2 text-3xl font-black uppercase tracking-[0.2em] text-soldout [box-shadow:0_0_30px_-4px_var(--color-soldout)] [text-shadow:0_0_22px_color-mix(in_oklab,var(--color-soldout)_70%,transparent)] md:px-12 md:py-3 md:text-5xl">
                              Sold out
                            </span>
                          </div>
                        )}

                        {/*
                          L'incrémenteur est désormais TOUJOURS visible
                          (2026-08-18). Auparavant il fallait d'abord cliquer la
                          carte pour la « sélectionner », ce qui ajoutait un
                          clic et un état à comprendre avant de pouvoir
                          seulement choisir une quantité — pour aucun gain. La
                          carte n'est donc plus un bouton : elle n'a plus qu'un
                          seul point d'interaction, celui qui compte.
                        */}
                        <div
                          // L'atténuation porte sur le CONTENU, jamais sur le
                          // conteneur : le tampon « Sold out » est son frère,
                          // l'affadir avec le reste effacerait le message qu'on
                          // veut justement rendre impossible à manquer.
                          className={`flex flex-wrap items-start gap-x-6 gap-y-4 p-6 md:flex-nowrap md:p-8 ${
                            dimmed && !onRequest ? 'opacity-45' : ''
                          }`}
                        >
                          {/* `basis-full` sous md : sans lui, `flex-wrap` garde
                              le texte et le bloc prix sur la MÊME ligne et se
                              contente de comprimer le premier — sur un écran
                              de 375 px, « Table réservée 6 personnes » tombait
                              à un mot par ligne. Le forcer sur sa propre ligne
                              renvoie le prix en dessous, où il a la place. */}
                          <div className="min-w-0 flex-1 basis-full md:basis-0">
                            {/* Pastille de qualification AU-DESSUS du nom :
                                « uniquement pour les filles », « sur
                                réservation » — c'est une condition d'accès, il
                                faut la lire avant la formule, pas après. */}
                            {onRequest && ticket.requestBadge && (
                              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                                <Sparkles className="size-3" />
                                {ticket.requestBadge}
                              </span>
                            )}
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
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
                            </div>

                            {ticket.description && (
                              <p className="mt-1.5 text-sm leading-relaxed text-waterloo dark:text-manatee">
                                {ticket.description}
                              </p>
                            )}

                            {/*
                              Bénéfices en puces cochées sur deux colonnes : on
                              compare deux formules d'un balayage, là où deux
                              paragraphes obligent à les lire l'une après
                              l'autre pour trouver ce qui les distingue.
                            */}
                            {features.length > 0 && (
                              // `auto-fit` plutôt que `sm:grid-cols-2` : le
                              // nombre de colonnes suit la place RÉELLEMENT
                              // disponible, pas la largeur de la fenêtre. Sur
                              // une carte « sur réservation », le bouton
                              // WhatsApp élargit la colonne de droite et
                              // deux colonnes fixes cassaient « Table réservée
                              // 4 personnes » sur trois lignes.
                              <ul className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-x-6 gap-y-1.5">
                                {features.map((feature) => (
                                  <li key={feature} className="flex items-start gap-2 text-sm">
                                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                                    <span className="min-w-0">{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <p className="mt-3 text-xs font-medium text-waterloo dark:text-manatee">
                              {onRequest
                                ? "Réservation directe auprès de l'organisateur"
                                : soldOut
                                ? 'Épuisé'
                                : notYetOnSale
                                  ? `En vente à partir du ${formatSaleDate(ticket.saleStartDate!)}`
                                  : saleOver
                                    ? 'Ventes clôturées'
                                    : `${available} place${available > 1 ? 's' : ''} restante${available > 1 ? 's' : ''}`}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-4">
                            <div className="text-right">
                              {hasPromo && (
                                <div className="text-sm font-medium text-manatee line-through dark:text-manatee">
                                  {formatCurrency(Number(ticket.compareAtPrice), ticket.currency)}
                                </div>
                              )}
                              {/* Prix barré quand il n'y a plus rien à vendre :
                                  le montant reste lisible (il informe encore
                                  sur le niveau de gamme) mais ne se présente
                                  plus comme une offre en cours. */}
                              <div
                                className={`font-event text-2xl leading-none md:text-3xl ${
                                  soldOut && !onRequest ? 'text-manatee line-through decoration-2' : ''
                                }`}
                              >
                                {formatCurrency(Number(ticket.price), ticket.currency)}
                              </div>
                              {/* « Réservation sur mesure » et non « / personne » :
                                  le montant affiché est un ordre de grandeur pour
                                  la formule entière, rien n'est encaissé ici — le
                                  présenter par personne serait un engagement de
                                  prix que la plateforme ne tient pas. */}
                              <div className="mt-1 text-[11px] text-waterloo dark:text-manatee">
                                {onRequest ? 'Réservation sur mesure' : '/ personne'}
                              </div>
                            </div>

                            {onRequest ? (
                              whatsappNumber ? (
                                <a
                                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                                    `Bonjour, je souhaite réserver la formule « ${ticket.name} ».`,
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  // Vert WhatsApp assumé plutôt que la couleur de
                                  // l'événement : ce bouton quitte le site pour une
                                  // application précise, l'annoncer par sa couleur
                                  // évite la surprise.
                                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90"
                                >
                                  <MessageCircle className="size-4" /> Réserver via WhatsApp
                                </a>
                              ) : (
                                // Sans numéro de contact renseigné, on n'invente
                                // pas de canal : on dit ce qu'on sait.
                                <span className="rounded-full border border-primary/40 px-4 py-2 text-xs font-semibold text-primary">
                                  Sur réservation
                                </span>
                              )
                            ) : unavailable || !isPublished ? (
                              // « Bientôt » se distingue des deux autres :
                              // c'est le seul état qui appelle un retour du
                              // visiteur, il porte donc la couleur de
                              // l'événement plutôt que le gris des billets
                              // morts.
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
                              <div className="flex items-center gap-1 rounded-full border border-stroke dark:border-strokedark">
                                <button
                                  type="button"
                                  aria-label={`Retirer une place — ${ticket.name}`}
                                  onClick={() => updateQuantity(ticket.id, -1, maxSelectable)}
                                  disabled={quantity === 0}
                                  className="flex size-10 items-center justify-center rounded-full text-manatee transition-colors hover:text-black disabled:opacity-30 dark:text-manatee dark:hover:text-white"
                                >
                                  <Minus className="size-4" />
                                </button>
                                <span
                                  aria-live="polite"
                                  className="w-6 text-center font-semibold tabular-nums"
                                >
                                  {quantity}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Ajouter une place — ${ticket.name}`}
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

                        {/* Le plafond ne se dit qu'une fois atteint : l'annoncer
                            d'avance sur chaque carte parasiterait la lecture
                            pour une règle que presque personne ne touche. */}
                        {selected && quantity >= maxSelectable && maxSelectable > 0 && (
                          <div className="border-t border-stroke px-6 py-3 text-xs font-medium text-waterloo dark:border-strokedark dark:text-manatee md:px-8">
                            {maxSelectable === 1
                              ? 'Une place par commande pour ce billet.'
                              : `Maximum ${maxSelectable} places par commande pour ce billet.`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/*
          Récapitulatif — colonne de droite sur grand écran uniquement. Sous
          `lg`, c'est la barre collante en bas de section qui prend le relais :
          une colonne latérale devenue pleine largeur, poussée sous une liste
          de billets, ne serait plus un récapitulatif mais un pied de page.
        */}
        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <div className="rounded-3xl border border-stroke p-6 dark:border-strokedark">
            <h3 className="font-event text-xl">Récapitulatif</h3>
            <div className="mt-4">{summaryLines}</div>

            <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-stroke pt-4 dark:border-strokedark">
              <span className="text-sm font-medium">Total</span>
              <span className="font-event text-2xl leading-none">
                {formatCurrency(totalAmount, currency)}
              </span>
            </div>

            <div className="mt-5">{payButton}</div>
            {reassurance}
          </div>
        </aside>
      </div>

      {/* Barre collante — mobile et tablette. Elle n'apparaît qu'une fois un
          billet retenu : présente en permanence, elle mangerait une bande
          d'écran déjà étroite pour n'annoncer qu'un total à zéro. */}
      {totalQuantity > 0 && (
        <div className="sticky bottom-4 z-30 mt-6 rounded-3xl border border-stroke bg-white/95 p-5 shadow-solid-2 backdrop-blur dark:border-strokedark dark:bg-blacksection/95 lg:hidden">
          <div className="text-[11px] font-bold uppercase tracking-wide text-waterloo dark:text-manatee">
            Récapitulatif
          </div>
          <div className="mt-3">{summaryLines}</div>

          <div className="mt-4 flex items-center justify-between gap-4 border-t border-stroke pt-4 dark:border-strokedark">
            <div className="min-w-0">
              <div className="font-event text-lg leading-none">
                {formatCurrency(totalAmount, currency)}
              </div>
              <div className="mt-1 text-[11px] text-waterloo dark:text-manatee">
                {totalQuantity} billet{totalQuantity > 1 ? 's' : ''} sélectionné
                {totalQuantity > 1 ? 's' : ''}
              </div>
            </div>
            <div className="w-40 shrink-0">{payButton}</div>
          </div>
          {reassurance}
        </div>
      )}
    </SectionShell>
  );
}
