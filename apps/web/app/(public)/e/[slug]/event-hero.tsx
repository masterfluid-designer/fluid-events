import { CalendarDays, MapPin, Ticket } from 'lucide-react';

/**
 * EventHero — bandeau d'ouverture immersif de la page publique (refonte
 * "haute fidélité orncity") : pleine largeur et haute, badge pilule, titre
 * display massif, ligne date/lieu, description, double CTA, et une carte
 * statistique flottante. Remplace l'ancien bandeau de couverture fixe de
 * 256px enfermé dans une carte étroite.
 *
 * Utilisé par les DEUX chemins de rendu : le bloc Builder `hero` (qui peut
 * surcharger titre/image via ses props) et le rendu de repli de `page.tsx`.
 */
export function EventHero({
  title,
  description,
  imageUrl,
  dateLabel,
  location,
  isPublished,
  ticketsAnchorId,
  scheduleAnchorId,
  stat,
}: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  dateLabel: string;
  location?: string | null;
  isPublished: boolean;
  ticketsAnchorId?: string;
  scheduleAnchorId?: string;
  stat?: { value: string; label: string } | null;
}) {
  return (
    <section id="top" className="relative isolate overflow-hidden">
      {/* Fond : image de couverture si fournie, sinon la trame diagonale de marque. */}
      <div
        className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(135deg,#EFEDE7_0_14px,#E7E4DE_14px_28px)] bg-cover bg-center dark:bg-[repeating-linear-gradient(135deg,#24221F_0_14px,#1B1A18_14px_28px)]"
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/25" />

      <div className="mx-auto flex min-h-[78svh] max-w-6xl flex-col justify-end px-5 pb-12 pt-24 text-white md:px-8 md:pb-16 md:pt-32">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {isPublished ? 'Billets ouverts' : 'Bientôt disponible'}
          </span>

          <h1 className="mt-6 font-event text-5xl leading-[0.9] tracking-[-0.02em] sm:text-6xl md:text-7xl lg:text-8xl">
            {title}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold md:text-base">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" /> {dateLabel}
            </span>
            {location && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4 text-primary" /> {location}
              </span>
            )}
          </div>

          {description && (
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/80 md:text-base">
              {description}
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {ticketsAnchorId && (
              <a
                href={`#${ticketsAnchorId}`}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho"
              >
                Acheter mes billets <Ticket className="size-4" />
              </a>
            )}
            {scheduleAnchorId && (
              <a
                href={`#${scheduleAnchorId}`}
                className="inline-flex items-center rounded-full border border-white/35 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Voir le programme
              </a>
            )}
          </div>
        </div>

        {stat && (
          <div className="mt-10 w-fit rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 backdrop-blur-md md:mt-12">
            <div className="font-event text-2xl leading-none md:text-3xl">{stat.value}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
              {stat.label}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
