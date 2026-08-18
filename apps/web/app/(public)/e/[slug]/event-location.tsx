import { MapPin, Phone, Navigation, MessageCircle } from 'lucide-react';
import { buildMapsUrl, formatEventAddress, type EventLocationFields } from '@saas-events/utils';
import { SectionShell, SectionHeading } from './section-shell';
import { EventMap, type MapVenue } from './event-map';

/**
 * EventLocation — Bloc « Où ça se passe » (décision produit 2026-08-16),
 * doté d'une vraie carte depuis le 2026-08-18.
 *
 * Ce bloc s'est longtemps privé de carte, au motif — écrit noir sur blanc ici
 * même — qu'elle « imposerait une clé d'API facturée ». C'était faux : Leaflet
 * est libre et les tuiles OpenStreetMap/CARTO ne demandent ni compte ni clé.
 * Le seul vrai coût est l'attribution, obligatoire, que la carte affiche.
 *
 * Le lien « Ouvrir l'itinéraire » reste à côté de la carte, et non dedans : la
 * carte sert à SITUER, l'itinéraire à PARTIR — sur mobile ce lien ouvre
 * directement l'application de navigation installée, ce qu'aucune carte
 * intégrée ne sait faire.
 *
 * Le contenu vient des champs de l'événement, pas des props du bloc : même
 * principe que faq/schedule/speakers, un seul jeu de données par événement
 * plutôt qu'un contenu dupliqué à chaque instance de bloc.
 */

/**
 * Les coordonnées arrivent en `number` ou en `string` (Prisma sérialise les
 * Decimal en chaîne). On ne garde le point que s'il est réellement chiffré :
 * un `NaN` passé à Leaflet fait planter le rendu de toute la section.
 */
function toCoord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function EventLocation({
  fields,
  accessNotes,
  contactPhone,
  anchorId,
}: {
  fields: EventLocationFields;
  accessNotes?: string | null;
  contactPhone?: string | null;
  anchorId?: string;
}) {
  const address = formatEventAddress(fields);
  // wa.me attend le numéro international SANS « + » ni séparateurs. Le champ
  // est validé en E.164 à l’écriture, mais on nettoie quand même : un espace
  // ou un point suffirait à produire un lien qui n’ouvre rien.
  const whatsappNumber = contactPhone?.replace(/[^0-9]/g, '') || null;
  const mapsUrl = buildMapsUrl(fields);

  // Rien à montrer : on ne rend pas une section vide avec un titre orphelin.
  // `accessNotes` ne compte plus ici : ces indications sont passées à
  // l'espace client (2026-08-18). Une section « Accès » qui n'aurait plus
  // qu'elles à montrer ne doit donc pas s'ouvrir.
  if (!address && !contactPhone) return null;

  // La carte n'apparaît que si l'organisateur a réellement géolocalisé son
  // lieu. Sans coordonnées, on ne devine pas : une carte centrée au hasard
  // désinformerait plus qu'une absence de carte.
  const latitude = toCoord(fields.latitude);
  const longitude = toCoord(fields.longitude);
  const venues: MapVenue[] =
    latitude !== null && longitude !== null
      ? [
          {
            id: 'main',
            label: "Lieu de l'événement",
            name: fields.venueName?.trim() || address || 'Lieu',
            latitude,
            longitude,
          },
        ]
      : [];
  const hasMap = venues.length > 0;

  return (
    <SectionShell id={anchorId} tone="muted">
      <SectionHeading
        eyebrow="Accès"
        title="Où ça se passe"
        description={
          hasMap
            ? "Le lieu sur la carte, comment y entrer, et qui appeler en cas de doute."
            : 'Le lieu exact, comment y entrer, et qui appeler en cas de doute.'
        }
      />

      {hasMap && (
        <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* `isolate` + `z-0` : Leaflet empile ses propres couches à des
              z-index élevés (jusqu'à 1000 pour les popups) — sans contexte
              d'empilement dédié, elles passeraient AU-DESSUS de l'en-tête
              collant de la page. */}
          <div className="isolate z-0 h-72 overflow-hidden rounded-2xl border border-stroke dark:border-strokedark md:h-96">
            <EventMap venues={venues} />
          </div>

          <div className="flex flex-col gap-4">
            {venues.map((venue) => (
              <div
                key={venue.id}
                className="flex flex-1 flex-col justify-center rounded-2xl border border-stroke p-6 dark:border-strokedark"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MapPin className="size-5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wide text-waterloo dark:text-manatee">
                      {venue.label}
                    </div>
                    <p className="mt-1 font-event text-xl leading-tight">{venue.name}</p>
                    {address && venue.name !== address && (
                      <p className="mt-1.5 text-sm leading-relaxed text-waterloo dark:text-manatee">
                        {address}
                      </p>
                    )}
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho"
                      >
                        Ouvrir l&apos;itinéraire <Navigation className="size-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`grid gap-4 md:grid-cols-2 ${hasMap ? '' : 'mx-auto max-w-4xl'}`}>
        {/* `items-stretch` est le défaut d’une grille, mais il n’agit que sur
            les colonnes : les cartes empilées à droite doivent à leur tour
            grandir (`flex-1`), sinon la colonne s’étire et son contenu laisse
            un vide en bas — deux blocs côte à côte de hauteurs différentes. */}
        {/* Avec la carte, l'adresse et son bouton d'itinéraire vivent déjà
            dans la fiche de lieu à droite : la répéter ici ne ferait que
            doubler le même contenu à deux endroits de la même section. */}
        {address && !hasMap && (
          <div className="flex h-full flex-col rounded-2xl border border-stroke p-6 dark:border-strokedark">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-waterloo dark:text-manatee">
                  Adresse
                </div>
                <p className="mt-1.5 text-sm leading-relaxed">{address}</p>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    // noreferrer autant que noopener : on n'a aucune raison
                    // d'annoncer à Google d'où vient le visiteur.
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho"
                  >
                    <Navigation className="size-4" /> Ouvrir dans Maps
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Les indications d'accès ont quitté cette page (2026-08-18) :
            « présentez votre QR à l'accueil » ne parle qu'à qui a déjà
            acheté. Elles s'affichent désormais sur le billet, dans l'espace
            client. Le contact, lui, sert AVANT l'achat — il reste ici. */}
        {contactPhone && (
          <div className="flex flex-col gap-4">
            {contactPhone && (
              <div className="flex flex-1 flex-col rounded-2xl border border-stroke p-6 dark:border-strokedark">
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wide text-waterloo dark:text-manatee">
                      Contact de l&apos;événement
                    </div>
                    {/* Lien tel: — sur mobile, un numéro affiché sans lien
                        oblige à le recopier à la main. */}
                    {/* `block` et non `inline-block` : en ligne, le bouton
                        WhatsApp qui suit remontait sur la même ligne que le
                        numéro et le recouvrait (constaté le 2026-08-18). */}
                    <a
                      href={`tel:${contactPhone}`}
                      className="mt-1.5 block text-sm font-semibold hover:underline"
                    >
                      {contactPhone}
                    </a>
                    {whatsappNumber && (
                      <a
                        href={`https://wa.me/${whatsappNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primaryho"
                      >
                        <MessageCircle className="size-4" /> Contacter via WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionShell>
  );
}
