import { MapPin, Phone, Navigation, Info, MessageCircle } from 'lucide-react';
import { buildMapsUrl, formatEventAddress, type EventLocationFields } from '@saas-events/utils';
import { SectionShell, SectionHeading } from './section-shell';

/**
 * EventLocation — Bloc « Où ça se passe » (décision produit 2026-08-16).
 *
 * Volontairement SANS carte intégrée : afficher une vraie carte imposerait une
 * clé d'API facturée au chargement et ferait charger un tiers chez chaque
 * visiteur. Un lien vers l'URL de recherche documentée par Google suffit — et
 * sur mobile il ouvre directement l'application de navigation installée.
 *
 * Le contenu vient des champs de l'événement, pas des props du bloc : même
 * principe que faq/schedule/speakers, un seul jeu de données par événement
 * plutôt qu'un contenu dupliqué à chaque instance de bloc.
 */
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
  if (!address && !accessNotes && !contactPhone) return null;

  return (
    <SectionShell id={anchorId} tone="muted">
      <SectionHeading
        eyebrow="Accès"
        title="Où ça se passe"
        description="Le lieu exact, comment y entrer, et qui appeler en cas de doute."
      />

      <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
        {/* `items-stretch` est le défaut d’une grille, mais il n’agit que sur
            les colonnes : les cartes empilées à droite doivent à leur tour
            grandir (`flex-1`), sinon la colonne s’étire et son contenu laisse
            un vide en bas — deux blocs côte à côte de hauteurs différentes. */}
        {address && (
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

        {(accessNotes || contactPhone) && (
          <div className="flex flex-col gap-4">
            {accessNotes && (
              <div className="flex flex-1 flex-col rounded-2xl border border-stroke p-6 dark:border-strokedark">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wide text-waterloo dark:text-manatee">
                      Accès
                    </div>
                    {/* whitespace-pre-line : l'organisateur saisit ses
                        indications sur plusieurs lignes, elles doivent le
                        rester à l'affichage. */}
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">
                      {accessNotes}
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                    <a
                      href={`tel:${contactPhone}`}
                      className="mt-1.5 inline-block text-sm font-semibold hover:underline"
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
