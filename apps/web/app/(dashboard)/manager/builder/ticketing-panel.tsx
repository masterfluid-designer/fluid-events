'use client';

import { useId } from 'react';
import { CalendarDays, CalendarRange, Check, Lock, Plus, Sun, Trash2 } from 'lucide-react';
import { TicketPolicy } from '@saas-events/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * TicketingPanel — Régime de billetterie et journées de l'événement
 * (décision produit 2026-08-16).
 *
 * Le régime se choisit dans une grille de cartes-radio plutôt que dans un
 * <select> : les trois options n'ont pas le même effet sur le contrôle
 * d'accès, et un menu déroulant cacherait justement ce qui les distingue.
 * Chaque carte porte sa conséquence à l'entrée, pas seulement son nom.
 *
 * Les vrais <input type="radio"> sont conservés (masqués visuellement) :
 * navigation au clavier, flèches entre options et lecteurs d'écran
 * fonctionnent sans avoir à réimplémenter le comportement d'un groupe radio.
 *
 * Hors palier Premium, les deux options multi-jours sont verrouillées côté
 * interface — le serveur refuse de toute façon (RULES.md §1), ceci n'est
 * qu'un raccourci d'affichage.
 */

export interface EventDayDraft {
  label: string;
  /** Format YYYY-MM-DD — ce que rend un <input type="date">. */
  date: string;
}

const POLICY_CARDS = [
  {
    value: TicketPolicy.SINGLE_DAY,
    icon: Sun,
    title: 'Une seule journée',
    description: 'Un billet, une entrée. Le fonctionnement par défaut.',
    premium: false,
  },
  {
    value: TicketPolicy.PASS_ALL_DAYS,
    icon: CalendarRange,
    title: 'Pass tous les jours',
    description: 'Un billet couvre tout l’événement : une entrée autorisée par journée.',
    premium: true,
  },
  {
    value: TicketPolicy.PER_DAY,
    icon: CalendarDays,
    title: 'Billet par jour',
    description: 'Chaque billet n’ouvre que sa journée. Le panier permet d’en prendre plusieurs.',
    premium: true,
  },
] as const;

export function TicketingPanel({
  policy,
  days,
  isPremium,
  onPolicyChange,
  onDaysChange,
}: {
  policy: TicketPolicy;
  days: EventDayDraft[];
  isPremium: boolean;
  onPolicyChange: (policy: TicketPolicy) => void;
  onDaysChange: (days: EventDayDraft[]) => void;
}) {
  // Nom de groupe unique par instance : deux panneaux sur une même page
  // partageraient sinon un seul groupe radio, et cocher l’un décocherait
  // l’autre (constaté en vérification).
  const groupName = `ticket-policy-${useId()}`;
  const multiDay = policy !== TicketPolicy.SINGLE_DAY;

  function addDay() {
    onDaysChange([...days, { label: `Jour ${days.length + 1}`, date: '' }]);
  }

  function updateDay(index: number, patch: Partial<EventDayDraft>) {
    onDaysChange(days.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeDay(index: number) {
    onDaysChange(days.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {POLICY_CARDS.map((card) => {
          const locked = card.premium && !isPremium;
          const selected = policy === card.value;
          const Icon = card.icon;
          return (
            <label
              key={card.value}
              // `group` : l'état visuel suit le focus du radio masqué, pour
              // que la navigation au clavier reste visible.
              className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 transition-all ${
                selected
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                  : 'border-border hover:border-primary/40 hover:bg-accent/40'
              } ${locked ? 'cursor-not-allowed opacity-55 hover:border-border hover:bg-transparent' : ''} focus-within:ring-2 focus-within:ring-ring`}
            >
              <input
                type="radio"
                name={groupName}
                value={card.value}
                checked={selected}
                disabled={locked}
                onChange={() => onPolicyChange(card.value)}
                className="sr-only"
              />

              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                {selected && <Check className="size-4 shrink-0 text-primary" />}
                {locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
              </div>

              <div>
                <div className="text-xs font-semibold leading-tight">{card.title}</div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {card.description}
                </p>
              </div>

              {locked && (
                <span className="inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Premium
                </span>
              )}
            </label>
          );
        })}
      </div>

      {!isPremium && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          Les événements sur plusieurs jours sont réservés au palier Premium. Demandez son activation
          à un administrateur.
        </p>
      )}

      {multiDay && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Journées ({days.length})</span>
            <Button type="button" variant="outline" size="sm" onClick={addDay}>
              <Plus className="size-3.5" /> Ajouter
            </Button>
          </div>

          {days.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
              Aucune journée déclarée. Il en faut au moins deux.
            </p>
          )}

          {days.map((day, index) => (
            // Index en clé : les journées n'ont pas d'identifiant tant qu'elles
            // ne sont pas enregistrées, et la liste est réordonnée uniquement
            // par ajout/suppression en fin — pas de réordonnancement interne.
            <div key={index} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <Input
                value={day.label}
                onChange={(e) => updateDay(index, { label: e.target.value })}
                placeholder={`Jour ${index + 1}`}
                aria-label={`Libellé de la journée ${index + 1}`}
              />
              <Input
                type="date"
                value={day.date}
                onChange={(e) => updateDay(index, { date: e.target.value })}
                aria-label={`Date de la journée ${index + 1}`}
                className="w-[9.5rem]"
              />
              <button
                type="button"
                onClick={() => removeDay(index)}
                aria-label={`Supprimer la journée ${index + 1}`}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          {days.length === 1 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              Une seule journée revient à un événement mono-jour — ajoutez-en une seconde ou
              repassez sur « Une seule journée ».
            </p>
          )}
        </div>
      )}
    </div>
  );
}
