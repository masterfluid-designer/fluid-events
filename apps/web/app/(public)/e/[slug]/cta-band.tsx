import { Ticket } from 'lucide-react';

/**
 * CtaBand — bande d'appel à l'action pleine largeur en bas de page (pattern
 * orncity : "Prêt à vivre la CAN à Lomé ?"). Rappelle l'achat après que le
 * visiteur a parcouru tout le contenu.
 */
export function CtaBand({ eventTitle, ticketsAnchorId }: { eventTitle: string; ticketsAnchorId: string }) {
  // Retrait SYMÉTRIQUE (2026-08-20) : la section n’avait que du padding en bas,
  // le bandeau démarrait donc exactement au bord supérieur et venait buter
  // contre la section précédente. Une carte posée sur la page se respire des
  // deux côtés — sans quoi elle a l’air d’avoir glissé.
  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      {/* Le bandeau porte le MÊME dégradé que les boutons d'action (2026-08-20)
          — c'était le seul aplat d'accent restant sur la page, et il jurait
          juste au-dessus du pied de page.

          Marges internes revues : `px-6` sur toute la largeur laissait le titre
          coller aux bords sur grand écran, et `py-16` + `gap-5` + un `mt-1` sur
          le bouton empilaient trois espacements concurrents. Un seul `gap` mène
          désormais le rythme vertical. */}
      <div
        className="accent-band mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-3xl px-6 py-14 text-center text-primary-foreground sm:px-10 md:gap-7 md:px-16 md:py-20"
      >
        <h2 className="max-w-3xl font-event text-4xl leading-[0.95] tracking-tight md:text-5xl lg:text-6xl">
          Prêt à vivre {eventTitle} ?
        </h2>
        <p className="max-w-md text-base opacity-90 md:text-lg">
          Les billets sont en quantité limitée. Réservez le vôtre dès maintenant.
        </p>
        <a
          href={`#${ticketsAnchorId}`}
          className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-black"
        >
          Acheter mes billets <Ticket className="size-4" />
        </a>
      </div>
    </section>
  );
}
