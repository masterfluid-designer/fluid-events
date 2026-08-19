'use client';

import type { FaqEntry, MediaEntry, ScheduleEntry, SpeakerEntry } from '@saas-events/types';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

/**
 * ConfigPanel — Onglet "Config" du Builder (décision produit 2026-07-13).
 *
 * Contenu CENTRALISÉ par événement (un seul jeu de données), éditable ici,
 * consommé par les blocs de placement correspondants (faq/schedule/speakers/
 * gallery/sponsors) quand ils sont posés sur la page — voir BlockRenderer.
 * L'état est possédé par le parent (`page.tsx`), ce panneau ne fait que
 * l'afficher/le modifier via `onChange`, exactement comme le panneau de
 * propriétés d'un bloc.
 */

export interface EventConfig {
  title: string;
  description: string;
  /** Adresse libre historique — repli d’affichage si rien de structuré. */
  location: string;
  // Localisation structurée (2026-08-16) — alimente le bloc « Lieu & accès ».
  venueName: string;
  addressLine: string;
  city: string;
  country: string;
  accessNotes: string;
  contactPhone: string;
  // Saisies en texte : un <input type=number> vidé renvoie '', et forcer un
  // nombre ici obligerait à gérer NaN dans le state. Converties à l’envoi.
  latitude: string;
  longitude: string;
  logoUrl: string;
  coverImageUrl: string;
  /** Affiche officielle du hero — image ou vidéo (2026-08-19). */
  officialMediaUrl: string;
  officialMediaAspect: string;
  /** Fond du hero — vide, l'affiche officielle sert de fond. */
  heroBackdropUrl: string;
  faqs: FaqEntry[];
  schedule: ScheduleEntry[];
  speakers: SpeakerEntry[];
  galleryImages: MediaEntry[];
  sponsorImages: MediaEntry[];
}

const FAQ_MAX = 5;
const SCHEDULE_MAX = 30;
const SPEAKERS_MAX = 20;
const MEDIA_MAX = 30;

/**
 * Journée à laquelle une entrée du programme se rattache — déduite de sa DATE,
 * jamais choisie à part (2026-08-19). Un champ « journée » obligerait à ranger
 * chaque entrée à la main, et à corriger ce rangement à chaque horaire déplacé.
 * L'afficher ici évite à l'organisateur de deviner ce que la page publique
 * fera de sa saisie.
 */
function dayOfEntry(
  startsAt: string,
  days: Array<{ label: string; date: string }>,
): { label: string; connue: boolean } {
  if (!startsAt) return { label: 'Sans date', connue: false };
  const jour = startsAt.slice(0, 10);
  const trouve = days.find((d) => d.date && d.date.slice(0, 10) === jour);
  return trouve
    ? { label: trouve.label, connue: true }
    : { label: 'Hors des journées déclarées', connue: false };
}

/**
 * Adresse en une ligne, pour la recherche de coordonnées. On ne renvoie rien
 * quand il n'y a pas de quoi chercher : un lien vers une carte vide
 * n'aiderait personne.
 */
function formatAddressQuery(config: EventConfig): string {
  return [config.venueName, config.addressLine, config.city, config.country]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Extrait des coordonnées d'un lien de carte ou d'un texte collé
 * (2026-08-19).
 *
 * Personne ne connaît sa latitude par cœur, mais tout le monde sait ouvrir
 * Google Maps et copier le lien de la barre d'adresse. On y lit les formes
 * courantes, sans appeler le moindre service :
 *
 *   .../@5.316667,-4.033333,17z      Google Maps (barre d'adresse)
 *   ...?q=5.316667,-4.033333          lien de partage, OpenStreetMap
 *   ...!3d5.316667!4d-4.033333        format interne Google
 *   5.316667, -4.033333               simple copier-coller
 *
 * Les liens raccourcis (maps.app.goo.gl) ne contiennent PAS les coordonnées :
 * il faudrait suivre la redirection côté serveur. On le dit plutôt que de
 * laisser l'organisateur devant un champ qui refuse sans expliquer.
 */
function parseCoordinates(input: string): { lat: string; lon: string } | null {
  const texte = input.trim();
  if (!texte) return null;

  const motifs = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query)=(-?\d{1,3}\.\d+)[,/](-?\d{1,3}\.\d+)/,
    // OpenStreetMap sépare les deux paramètres au lieu de les joindre.
    /[?&]mlat=(-?\d{1,3}\.\d+)[^]*?[?&]mlon=(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/,
  ];

  for (const motif of motifs) {
    const trouve = texte.match(motif);
    if (!trouve) continue;
    const lat = Number(trouve[1]);
    const lon = Number(trouve[2]);
    // Hors de ces bornes ce ne sont pas des coordonnées, quoi qu’en dise la
    // forme du texte — mieux vaut refuser que placer un point en mer.
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    return { lat: String(lat), lon: String(lon) };
  }
  return null;
}

export function ConfigPanel({
  config,
  onChange,
  days = [],
}: {
  config: EventConfig;
  onChange: (patch: Partial<EventConfig>) => void;
  /** Journées déclarées — servent à situer chaque entrée du programme. */
  days?: Array<{ label: string; date: string }>;
}) {
  return (
    <div className="flex flex-col gap-6 p-4">
      <Section title="Informations générales">
        <ImageUploadField
          label="Logo de l'événement"
          value={config.logoUrl || undefined}
          onChange={(url) => onChange({ logoUrl: url ?? '' })}
        />
        <Field label="Nom de l'événement">
          <Input value={config.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea
            value={config.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </Field>
        <ImageUploadField
          label="Image de couverture"
          value={config.coverImageUrl || undefined}
          onChange={(url) => onChange({ coverImageUrl: url ?? '' })}
        />
        {/* Affiche officielle (2026-08-19) — distincte de la couverture, qui
            n'est qu'une vignette de partage. Celle-ci est le visuel montré EN
            GRAND dans la colonne droite du hero, à son format réel, et repris
            en fond de section. Vide, le hero retombe sur la couverture. */}
        <div className="flex flex-col gap-2">
          <ImageUploadField
            label="Image officielle (affiche ou vidéo)"
            allowVideo
            value={config.officialMediaUrl || undefined}
            onChange={(url) => onChange({ officialMediaUrl: url ?? '' })}
          />
          <p className="text-[11px] text-muted-foreground">
            Affichée dans le hero, à droite du titre, et reprise en fond de section. Laissez
            vide pour utiliser l&apos;image de couverture.
          </p>
          {/* Fond distinct (2026-08-19) : une affiche très chargée reste
              illisible sous le titre même floutée. Ce champ permet d'y mettre
              un visuel plus calme sans toucher à l'affiche. */}
          <ImageUploadField
            label="Image de fond du hero (optionnel)"
            value={config.heroBackdropUrl || undefined}
            onChange={(url) => onChange({ heroBackdropUrl: url ?? '' })}
          />
          <p className="text-[11px] text-muted-foreground">
            Floutée et assombrie derrière le titre. Laissez vide pour reprendre l&apos;image
            officielle.
          </p>
          {config.officialMediaUrl && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Format d&apos;affichage
              </label>
              <div className="flex flex-wrap gap-2">
                {(['4:5', '1:1', '9:16'] as const).map((ratio) => {
                  const actif = (config.officialMediaAspect || '4:5') === ratio;
                  return (
                    <button
                      key={ratio}
                      type="button"
                      aria-pressed={actif}
                      onClick={() => onChange({ officialMediaAspect: ratio })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        actif
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <Field label="Localisation (affichage court)">
          <Input
            value={config.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Palais des Sports, Abidjan"
          />
        </Field>

        {/* Localisation exacte (décision produit 2026-08-16) — alimente le bloc
            « Lieu & accès » de la page publique. Tant que ces champs sont
            vides, c'est la ligne ci-dessus qui s'affiche. */}
        <Field label="Nom du lieu">
          <Input
            value={config.venueName}
            onChange={(e) => onChange({ venueName: e.target.value })}
            placeholder="Palais des Sports de Treichville"
          />
        </Field>
        <Field label="Adresse">
          <Input
            value={config.addressLine}
            onChange={(e) => onChange({ addressLine: e.target.value })}
            placeholder="Boulevard de Marseille"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ville">
            <Input
              value={config.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="Abidjan"
            />
          </Field>
          <Field label="Pays">
            <Input
              value={config.country}
              onChange={(e) => onChange({ country: e.target.value })}
              placeholder="Côte d'Ivoire"
            />
          </Field>
        </div>
        <Field label="Indications d'accès">
          <textarea
            value={config.accessNotes}
            onChange={(e) => onChange({ accessNotes: e.target.value })}
            rows={3}
            placeholder="Entrée côté nord, parking gratuit en face. Présentez votre QR à l'accueil."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </Field>
        <Field label="Numéro officiel de l'événement">
          <Input
            value={config.contactPhone}
            onChange={(e) => onChange({ contactPhone: e.target.value })}
            placeholder="+22890123456"
          />
        </Field>
        {/*
          Optionnelles pour le lien Maps, mais INDISPENSABLES à la carte : sans
          elles le bloc « Accès » n'affiche ni plan, ni encadré lieu, ni bouton
          d'itinéraire — il ne reste que le titre. Rien ne le disait, et un
          organisateur qui avait pourtant saisi son adresse cherchait une panne
          là où il manquait deux nombres (constaté en production 2026-08-19).
        */}
        {!config.latitude?.trim() || !config.longitude?.trim() ? (
          <p className="rounded-lg border border-dashed border-amber-500/50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
            Sans coordonnées, <strong>aucune carte ne s&apos;affiche</strong> sur votre page —
            l&apos;adresse seule ne suffit pas.{' '}
            {formatAddressQuery(config) && (
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(
                  formatAddressQuery(config),
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                Trouver celles de votre lieu
              </a>
            )}
            {formatAddressQuery(config)
              ? ' puis recopiez-les ci-dessous.'
              : ' Renseignez d’abord une adresse pour les retrouver facilement.'}
          </p>
        ) : null}
        {/* Coller un lien plutôt que taper deux nombres : c'est le geste que
            l'organisateur sait déjà faire. */}
        <Field label="Coller un lien Google Maps (ou « lat, lon »)">
          <Input
            placeholder="https://www.google.com/maps/place/.../@5.316667,-4.033333,17z"
            onChange={(e) => {
              const trouve = parseCoordinates(e.target.value);
              if (trouve) onChange({ latitude: trouve.lat, longitude: trouve.lon });
            }}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Les deux champs ci-dessous se remplissent seuls. Un lien raccourci
            (<code>maps.app.goo.gl</code>) ne contient pas les coordonnées : ouvrez-le d&apos;abord,
            puis copiez l&apos;adresse complète.
          </p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude (optionnel)">
            <Input
              value={config.latitude}
              onChange={(e) => onChange({ latitude: e.target.value })}
              placeholder="5.316667"
            />
          </Field>
          <Field label="Longitude (optionnel)">
            <Input
              value={config.longitude}
              onChange={(e) => onChange({ longitude: e.target.value })}
              placeholder="-4.033333"
            />
          </Field>
        </div>
      </Section>

      <Section title={`FAQ (${config.faqs.length}/${FAQ_MAX})`}>
        {config.faqs.map((faq) => (
          <div key={faq.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <Input
                  placeholder="Question"
                  value={faq.question}
                  onChange={(e) =>
                    onChange({
                      faqs: config.faqs.map((f) => (f.id === faq.id ? { ...f, question: e.target.value } : f)),
                    })
                  }
                />
                <textarea
                  placeholder="Réponse"
                  value={faq.answer}
                  onChange={(e) =>
                    onChange({
                      faqs: config.faqs.map((f) => (f.id === faq.id ? { ...f, answer: e.target.value } : f)),
                    })
                  }
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <button
                type="button"
                aria-label="Supprimer la FAQ"
                onClick={() => onChange({ faqs: config.faqs.filter((f) => f.id !== faq.id) })}
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.faqs.length >= FAQ_MAX}
          onClick={() =>
            onChange({ faqs: [...config.faqs, { id: crypto.randomUUID(), question: '', answer: '' }] })
          }
        >
          <Plus className="size-3.5" /> Ajouter une FAQ
        </Button>

        {config.faqs.length > 0 && (
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Aperçu en direct
            </div>
            <Accordion type="single" collapsible className="px-3">
              {config.faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger>{faq.question || 'Question sans titre'}</AccordionTrigger>
                  <AccordionContent>{faq.answer || '—'}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </Section>

      <Section title={`Programme (${config.schedule.length}/${SCHEDULE_MAX})`}>
        {days.length > 1 && (
          <p className="text-[11px] text-muted-foreground">
            Chaque entrée est rattachée à une journée d&apos;après sa date. La page publique
            affiche un onglet par journée.
          </p>
        )}
        {config.schedule.map((entry) => {
          const jour = dayOfEntry(entry.startsAt, days);
          return (
          <div key={entry.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            {days.length > 0 && (
              <span
                className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  jour.connue
                    ? 'bg-primary/10 text-primary'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-500'
                }`}
              >
                {jour.label}
              </span>
            )}
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <input
                  type="datetime-local"
                  value={entry.startsAt}
                  onChange={(e) =>
                    onChange({
                      schedule: config.schedule.map((s) =>
                        s.id === entry.id ? { ...s, startsAt: e.target.value } : s,
                      ),
                    })
                  }
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Input
                  placeholder="Titre (ex : Ouverture des portes)"
                  value={entry.title}
                  onChange={(e) =>
                    onChange({
                      schedule: config.schedule.map((s) =>
                        s.id === entry.id ? { ...s, title: e.target.value } : s,
                      ),
                    })
                  }
                />
                <Input
                  placeholder="Description (optionnel)"
                  value={entry.description ?? ''}
                  onChange={(e) =>
                    onChange({
                      schedule: config.schedule.map((s) =>
                        s.id === entry.id ? { ...s, description: e.target.value } : s,
                      ),
                    })
                  }
                />
              </div>
              <button
                type="button"
                aria-label="Supprimer l'entrée de programme"
                onClick={() => onChange({ schedule: config.schedule.filter((s) => s.id !== entry.id) })}
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>
        );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.schedule.length >= SCHEDULE_MAX}
          onClick={() =>
            onChange({
              schedule: [...config.schedule, { id: crypto.randomUUID(), startsAt: '', title: '' }],
            })
          }
        >
          <Plus className="size-3.5" /> Ajouter une entrée
        </Button>
      </Section>

      <Section title={`Speakers (${config.speakers.length}/${SPEAKERS_MAX})`}>
        {config.speakers.map((speaker) => (
          <div key={speaker.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <ImageUploadField
                  label="Photo"
                  value={speaker.photoUrl}
                  onChange={(url) =>
                    onChange({
                      speakers: config.speakers.map((s) =>
                        s.id === speaker.id ? { ...s, photoUrl: url } : s,
                      ),
                    })
                  }
                />
                <Input
                  placeholder="Nom complet"
                  value={speaker.name}
                  onChange={(e) =>
                    onChange({
                      speakers: config.speakers.map((s) =>
                        s.id === speaker.id ? { ...s, name: e.target.value } : s,
                      ),
                    })
                  }
                />
                <Input
                  placeholder="Rôle (ex : Keynote speaker)"
                  value={speaker.role}
                  onChange={(e) =>
                    onChange({
                      speakers: config.speakers.map((s) =>
                        s.id === speaker.id ? { ...s, role: e.target.value } : s,
                      ),
                    })
                  }
                />
                <Input
                  placeholder="Catégorie (optionnel — ex : DJ, Artiste, Speaker)"
                  value={speaker.category ?? ''}
                  onChange={(e) =>
                    onChange({
                      speakers: config.speakers.map((s) =>
                        s.id === speaker.id ? { ...s, category: e.target.value } : s,
                      ),
                    })
                  }
                />
              </div>
              <button
                type="button"
                aria-label="Supprimer le speaker"
                onClick={() => onChange({ speakers: config.speakers.filter((s) => s.id !== speaker.id) })}
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.speakers.length >= SPEAKERS_MAX}
          onClick={() =>
            onChange({
              speakers: [...config.speakers, { id: crypto.randomUUID(), name: '', role: '' }],
            })
          }
        >
          <Plus className="size-3.5" /> Ajouter un speaker
        </Button>
      </Section>

      <MediaListSection
        title={`Galerie (${config.galleryImages.length}/${MEDIA_MAX})`}
        items={config.galleryImages}
        max={MEDIA_MAX}
        onChange={(galleryImages) => onChange({ galleryImages })}
        addLabel="Ajouter une image"
      />

      <MediaListSection
        title={`Sponsors (${config.sponsorImages.length}/${MEDIA_MAX})`}
        items={config.sponsorImages}
        max={MEDIA_MAX}
        onChange={(sponsorImages) => onChange({ sponsorImages })}
        addLabel="Ajouter un logo sponsor"
        showRole
      />
    </div>
  );
}

function MediaListSection({
  title,
  items,
  max,
  onChange,
  addLabel,
  showRole,
}: {
  title: string;
  items: MediaEntry[];
  max: number;
  onChange: (items: MediaEntry[]) => void;
  addLabel: string;
  /** Sponsors uniquement (ex: "Partenaire hébergement officiel") — pas pertinent pour la galerie. */
  showRole?: boolean;
}) {
  return (
    <Section title={title}>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.id} className="relative flex flex-col gap-1">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="h-17.5 w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-black/80"
              >
                Retirer
              </button>
            </div>
            {showRole && (
              <Input
                placeholder="Rôle (ex : Partenaire hébergement officiel)"
                value={item.role ?? ''}
                onChange={(e) =>
                  onChange(items.map((i) => (i.id === item.id ? { ...i, role: e.target.value } : i)))
                }
                className="text-xs"
              />
            )}
          </div>
        ))}
      </div>
      {items.length < max && (
        <ImageUploadField
          label={addLabel}
          value={undefined}
          onChange={(url) => {
            if (url) onChange([...items, { id: crypto.randomUUID(), url }]);
          }}
        />
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold">{label}</label>
      {children}
    </div>
  );
}
