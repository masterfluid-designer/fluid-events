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
  location: string;
  logoUrl: string;
  coverImageUrl: string;
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

export function ConfigPanel({
  config,
  onChange,
}: {
  config: EventConfig;
  onChange: (patch: Partial<EventConfig>) => void;
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
        <Field label="Localisation">
          <Input
            value={config.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Palais des Sports, Abidjan"
          />
        </Field>
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
        {config.schedule.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
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
        ))}
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
}: {
  title: string;
  items: MediaEntry[];
  max: number;
  onChange: (items: MediaEntry[]) => void;
  addLabel: string;
}) {
  return (
    <Section title={title}>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.id} className="relative">
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
