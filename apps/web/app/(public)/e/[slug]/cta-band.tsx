import { Ticket } from 'lucide-react';

/**
 * CtaBand — bande d'appel à l'action pleine largeur en bas de page (pattern
 * orncity : "Prêt à vivre la CAN à Lomé ?"). Rappelle l'achat après que le
 * visiteur a parcouru tout le contenu.
 */
export function CtaBand({ eventTitle, ticketsAnchorId }: { eventTitle: string; ticketsAnchorId: string }) {
  return (
    <section className="px-5 pb-14 md:px-8 md:pb-20">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground md:py-20">
        <h2 className="max-w-3xl font-event text-4xl leading-[0.95] tracking-tight md:text-5xl lg:text-6xl">
          Prêt à vivre {eventTitle} ?
        </h2>
        <p className="max-w-md text-base opacity-90 md:text-lg">
          Les billets sont en quantité limitée. Réservez le vôtre dès maintenant.
        </p>
        <a
          href={`#${ticketsAnchorId}`}
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
        >
          Acheter mes billets <Ticket className="size-4" />
        </a>
      </div>
    </section>
  );
}
