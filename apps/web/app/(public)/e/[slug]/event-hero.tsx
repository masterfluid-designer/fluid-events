import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import { MediaShowcase } from './media-showcase';
import { isVideoUrl, type MediaAspect } from '@/lib/media';

/**
 * EventHero — bandeau d'ouverture immersif de la page publique (refonte
 * "haute fidélité orncity"), passé en DEUX COLONNES sur desktop (décision
 * produit 2026-08-17) : le contenu à gauche, un média d'affiche à droite.
 *
 * Le média de droite garde son format réel (4:5, carré ou story 9:16) plutôt
 * que d'être recadré en bandeau — une affiche verticale rognée en 16:9 perd
 * précisément ce qu'elle montre.
 *
 * Le fond de section reprend CE MÊME média, flouté et assombri s'il s'agit
 * d'une image, ou joué en cover muet si c'est une vidéo. L'assombrissement
 * n'est pas décoratif : c'est lui qui garde le texte blanc lisible par-dessus
 * n'importe quelle affiche.
 *
 * Utilisé par les DEUX chemins de rendu : le bloc Builder `hero` (qui peut
 * surcharger titre/image/média via ses props) et le rendu de repli de page.tsx.
 */
/**
 * Titre du hero avec UN mot mis en couleur d'accent (2026-08-18).
 *
 * Le mot est choisi par l'organisateur, jamais deviné : colorer
 * automatiquement le dernier mot mettrait « 2026 » en avant sur « Concert
 * FESTA 2026 », c'est-à-dire précisément le mot qui compte le moins. Sans
 * choix explicite, le titre reste d'une seule encre.
 *
 * La recherche ignore la casse mais ne porte que sur la PREMIÈRE occurrence :
 * un mot répété trois fois et colorié trois fois ne met plus rien en avant.
 */
function renderTitle(title: string, accentWord?: string | null) {
  const needle = accentWord?.trim();
  if (!needle) return title;
  const at = title.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return title;
  return (
    <>
      {title.slice(0, at)}
      <span className="text-primary">{title.slice(at, at + needle.length)}</span>
      {title.slice(at + needle.length)}
    </>
  );
}

export function EventHero({
  title,
  accentWord,
  description,
  imageUrl,
  mediaUrl,
  mediaAspect = '4:5',
  dateLabel,
  location,
  isPublished,
  ticketsAnchorId,
  scheduleAnchorId,
  stat,
  socialProof,
  lead,
}: {
  title: string;
  /** Mot du titre à passer en couleur d'accent — choisi, jamais deviné. */
  accentWord?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** Affiche ou vidéo mise en avant à droite (2026-08-17). */
  mediaUrl?: string | null;
  mediaAspect?: MediaAspect;
  dateLabel: string;
  location?: string | null;
  isPublished: boolean;
  ticketsAnchorId?: string;
  scheduleAnchorId?: string;
  stat?: { value: string; label: string } | null;
  /**
   * Preuve sociale sous les boutons — « Rejoint par +40 créateurs lors de la
   * dernière session » (décision produit 2026-08-18). Une phrase, pas de
   * portraits : le chiffre porte la crédibilité, et des visages inventés ou
   * pris ailleurs n'auraient rien prouvé.
   */
  socialProof?: string | null;
  /**
   * Accroche (2026-08-18) — la phrase qui VEND, au-dessus de la description.
   * Le modèle de l'organisateur pose deux niveaux de texte : une accroche
   * dense en gras, puis un paragraphe plus discret qui développe. Un seul
   * bloc de texte aplatissait les deux et ne hiérarchisait rien.
   */
  lead?: string | null;
}) {
  /**
   * L'affiche de droite retombe sur l'IMAGE OFFICIELLE de l'événement quand
   * aucun média dédié n'est posé (2026-08-18).
   *
   * Auparavant seul `mediaUrl` alimentait cette colonne : un organisateur qui
   * avait pourtant chargé son affiche voyait un cadre vide, alors que la même
   * image servait déjà de fond. Le média dédié reste prioritaire — c'est lui
   * qu'on choisit pour mettre une vidéo à cet endroit précis.
   */
  const media = mediaUrl || imageUrl || null;
  const mediaIsVideo = isVideoUrl(media);
  // Le fond reprend le MÊME visuel : une image floutée et assombrie derrière
  // le texte, une vidéo jouée en cover muet.
  const backgroundImage = mediaIsVideo ? null : media;

  return (
    <section id="top" className="relative isolate overflow-hidden">
      {mediaIsVideo && media ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={media}
          autoPlay
          muted
          loop
          playsInline
          // `aria-hidden` : c'est un décor. La même vidéo est offerte à la
          // lecture, avec son, dans la colonne de droite.
          aria-hidden="true"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(135deg,#EFEDE7_0_14px,#E7E4DE_14px_28px)] bg-cover bg-center dark:bg-[repeating-linear-gradient(135deg,#24221F_0_14px,#1B1A18_14px_28px)]"
          style={
            backgroundImage
              ? {
                  backgroundImage: `url(${backgroundImage})`,
                  // Flou léger + montée d'échelle : sans le `scale`, le flou
                  // laisserait des bords transparents sur les côtés.
                  filter: 'blur(14px)',
                  transform: 'scale(1.08)',
                }
              : undefined
          }
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/65 to-black/40" />

      <div className="mx-auto grid min-h-[78svh] max-w-6xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-24 text-white md:px-8 md:pb-16 md:pt-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-14">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {isPublished ? 'Billets ouverts' : 'Bientôt disponible'}
          </span>

          <h1 className="mt-6 font-event text-5xl leading-[0.9] tracking-[-0.02em] sm:text-6xl md:text-7xl">
            {renderTitle(title, accentWord)}
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

          {lead?.trim() && (
            <p className="mt-5 max-w-xl text-base font-semibold leading-snug text-white md:text-lg">
              {lead.trim()}
            </p>
          )}

          {description && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 md:text-base">
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

          {socialProof?.trim() ? (
            <p className="mt-5 text-sm text-white/75">{socialProof.trim()}</p>
          ) : (
            stat && (
              <div className="mt-10 w-fit rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 backdrop-blur-md">
                <div className="font-event text-2xl leading-none md:text-3xl">{stat.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
                  {stat.label}
                </div>
              </div>
            )
          )}
        </div>

        {/*
          Indicateur de défilement — le hero occupe 78svh, un visiteur peut
          croire la page finie. Masqué sous `md` : sur mobile le pouce trouve
          le défilement tout seul, et cette bande y coûterait de la hauteur.

          `aria-hidden` : il n'y a rien à annoncer, la page défile de toute
          façon. Décoratif au sens strict.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-6 hidden flex-col items-center gap-2 md:flex"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">
            Scroll
          </span>
          <span className="h-10 w-px bg-gradient-to-b from-white/60 to-transparent" />
        </div>

        {media && (
          // Masqué sous `lg` : en une seule colonne, l'affiche répéterait le
          // fond juste au-dessus du titre et volerait la hauteur d'écran.
          <div className="hidden w-full lg:block">
            <MediaShowcase
              url={media}
              aspect={mediaAspect}
              alt={`Affiche de ${title}`}
              className="shadow-2xl ring-1 ring-white/15"
            />
          </div>
        )}
      </div>
    </section>
  );
}
