/**
 * Tests — les alertes de la prise en main (2026-09-09).
 *
 * Ce qu'ils gardent n'est pas l'affichage d'un bandeau, mais la seule
 * condition qui compte : un questionnaire écrit, décoché, sur un événement EN
 * LIGNE. Chacune des trois est nécessaire, et le premier organisateur à avoir
 * perdu des réponses les remplissait toutes les trois sans que rien ne le lui
 * dise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsService } from './events.service';

function makeService(evenement: unknown) {
  const prisma = {
    event: { findUnique: vi.fn().mockResolvedValue(evenement) },
  };
  const acces = {
    resoudreEvenementDuManager: vi.fn(async () => 'ev-1'),
  };
  return new EventsService(
    prisma as never,
    { log: vi.fn().mockResolvedValue(undefined) } as never,
    acces as never,
    { heriterDesConfigsGlobales: vi.fn() } as never,
  );
}

/** Un événement en ligne, sur inscription, dont tout le reste est fait. */
function evenement(patch: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    title: 'Meet des élites',
    status: 'PUBLISHED',
    accessMode: 'RSVP',
    _count: { tickets: 0, scanners: 1, registrations: 5 },
    eventPage: { blocks: [{ type: 'hero' }] },
    paymentProviderConfigs: [],
    registrationForm: { isActive: false, fields: [{ id: 'q-1', type: 'TEXTE', libelle: 'Ville' }] },
    ...patch,
  };
}

describe('EventsService.getOnboarding() — alertes', () => {
  let service: EventsService;

  beforeEach(() => {
    service = makeService(evenement());
  });

  /*
   * LE test de ce fichier : c'est exactement l'état dans lequel un
   * organisateur a laissé son événement pendant six jours, pendant que cinq
   * personnes s'inscrivaient sans voir sa question.
   */
  it('signale un questionnaire écrit mais masqué sur un événement publié', async () => {
    const res = await service.getOnboarding('mgr-1');

    expect(res.alertes).toEqual([
      { cle: 'questionnaire-dormant', questions: 1, inscrits: 5 },
    ]);
  });

  it('se tait quand le questionnaire est affiché', async () => {
    service = makeService(
      evenement({ registrationForm: { isActive: true, fields: [{ id: 'q-1' }] } }),
    );

    expect((await service.getOnboarding('mgr-1')).alertes).toEqual([]);
  });

  /*
   * Sur un brouillon, un questionnaire éteint est un travail en cours et non
   * un oubli : personne ne peut s'inscrire, donc rien ne se perd. Alerter là
   * apprendrait à ignorer l'alerte.
   */
  it('se tait sur un événement en brouillon', async () => {
    service = makeService(evenement({ status: 'DRAFT' }));

    expect((await service.getOnboarding('mgr-1')).alertes).toEqual([]);
  });

  it('se tait quand le questionnaire est vide — il n’y a rien à perdre', async () => {
    service = makeService(evenement({ registrationForm: { isActive: false, fields: [] } }));

    expect((await service.getOnboarding('mgr-1')).alertes).toEqual([]);
  });

  it('se tait quand aucun questionnaire n’a jamais été composé', async () => {
    service = makeService(evenement({ registrationForm: null }));

    expect((await service.getOnboarding('mgr-1')).alertes).toEqual([]);
  });

  /*
   * L'alerte vaut même sans un seul inscrit : elle prévient AVANT la perte.
   * Le compte sert à graduer le message, pas à décider de l'afficher.
   */
  it('alerte aussi quand personne ne s’est encore inscrit', async () => {
    service = makeService(evenement({ _count: { tickets: 0, scanners: 1, registrations: 0 } }));

    expect((await service.getOnboarding('mgr-1')).alertes).toEqual([
      { cle: 'questionnaire-dormant', questions: 1, inscrits: 0 },
    ]);
  });

  /*
   * `fields` est une colonne JSON : une valeur non-tableau y est possible, et
   * ne doit pas faire tomber tout le tableau de bord.
   */
  it('supporte un `fields` qui n’est pas un tableau', async () => {
    service = makeService(
      evenement({ registrationForm: { isActive: false, fields: { casse: true } } }),
    );

    expect((await service.getOnboarding('mgr-1')).alertes).toEqual([]);
  });
});
