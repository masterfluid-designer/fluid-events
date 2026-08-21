/**
 * Tests unitaires — EventAccessService (2026-08-21).
 *
 * Ces tests sont écrits AVANT le branchement des services appelants. Le
 * `@unique` sur `Event.managerId` garantissait l'appartenance par le schéma ;
 * il vient de sauter, et c'est ce fichier qui reprend la garantie.
 *
 * Le risque couvert n'est pas un écran cassé : c'est un manager qui atteint
 * l'événement d'un autre en changeant un identifiant dans l'URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCodes } from '@saas-events/types';
import { EventAccessService } from './event-access.service';

function makePrisma() {
  return {
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    order: { count: vi.fn().mockResolvedValue(0) },
    user: { findUnique: vi.fn() },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

/** Extrait la réponse d'erreur NestJS, où vivent `code` et `details`. */
function corps(err: unknown): { code?: string; message?: string; details?: unknown } {
  return (err as { response: Record<string, unknown> }).response as never;
}

/**
 * Attend le REJET d'une promesse et en renvoie le corps d'erreur. Un simple
 * `.catch(corps)` laisserait passer une promesse résolue : le test vérifierait
 * alors les champs d’un succès, et passerait au vert pour la mauvaise raison.
 */
async function erreurDe(promesse: Promise<unknown>) {
  const succes = Symbol('aucune erreur');
  const issue = await promesse.then(() => succes, (e: unknown) => e);
  if (issue === succes) throw new Error('la promesse a abouti alors qu’un refus était attendu');
  return corps(issue);
}

describe('EventAccessService.resoudreEvenementDuManager()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventAccessService;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new EventAccessService(prisma as never, audit as never);
  });

  it("accepte un événement qui appartient bien au manager", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'evt-1', managerId: 'mgr-1' });

    await expect(service.resoudreEvenementDuManager('mgr-1', 'evt-1')).resolves.toBe('evt-1');
  });

  it("refuse l'événement d'un AUTRE manager", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'evt-1', managerId: 'mgr-autre' });

    await expect(service.resoudreEvenementDuManager('mgr-1', 'evt-1')).rejects.toThrow(NotFoundException);
  });

  it("répond la même chose pour « inexistant » et « pas à vous » — sinon on confirme l'existence d'un identifiant", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({ id: 'evt-1', managerId: 'mgr-autre' });
    const refus = await erreurDe(service.resoudreEvenementDuManager('mgr-1', 'evt-1'));

    prisma.event.findUnique.mockResolvedValueOnce(null);
    const absent = await erreurDe(service.resoudreEvenementDuManager('mgr-1', 'evt-inconnu'));

    expect(refus.code).toBe(ErrorCodes.EVENT_NOT_FOUND);
    expect(absent.code).toBe(ErrorCodes.EVENT_NOT_FOUND);
    expect(refus.message).toBe(absent.message);
  });

  it("sans identifiant, retombe sur l'unique événement du manager (compatibilité /mine)", async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'evt-seul' }]);

    await expect(service.resoudreEvenementDuManager('mgr-1')).resolves.toBe('evt-seul');
  });

  it("sans identifiant et avec PLUSIEURS événements, refuse au lieu de deviner", async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }]);

    const err = await erreurDe(service.resoudreEvenementDuManager('mgr-1'));
    expect(err.code).toBe(ErrorCodes.EVENT_SELECTION_REQUIRED);
  });

  it('sans identifiant et sans aucun événement, dit qu’il n’y en a pas', async () => {
    prisma.event.findMany.mockResolvedValue([]);

    const err = await erreurDe(service.resoudreEvenementDuManager('mgr-1'));
    expect(err.code).toBe(ErrorCodes.EVENT_NOT_FOUND);
  });
});

describe('EventAccessService.assertQuotaEvenements()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventAccessService;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new EventAccessService(prisma as never, audit as never);
  });

  it('laisse un manager FREE créer son premier événement', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'FREE' });
    prisma.event.count.mockResolvedValue(0);

    await expect(service.assertQuotaEvenements('mgr-1')).resolves.toBeUndefined();
  });

  it('refuse le deuxième événement en FREE', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'FREE' });
    prisma.event.count.mockResolvedValue(1);

    const err = await service.assertQuotaEvenements('mgr-1').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(corps(err).code).toBe(ErrorCodes.EVENT_QUOTA_REACHED);
  });

  it('laisse un PREMIUM aller jusqu’à huit, et refuse le neuvième', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'PREMIUM' });

    prisma.event.count.mockResolvedValue(7);
    await expect(service.assertQuotaEvenements('mgr-1')).resolves.toBeUndefined();

    prisma.event.count.mockResolvedValue(8);
    const err = await erreurDe(service.assertQuotaEvenements('mgr-1'));
    expect(err.code).toBe(ErrorCodes.EVENT_QUOTA_REACHED);
    expect(err.details).toEqual({ existants: 8, maximum: 8 });
  });

  it('traite un plan inconnu comme FREE — en cas de doute, on accorde le moins', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'PALIER_RETIRE_DE_L_OFFRE' });
    prisma.event.count.mockResolvedValue(1);

    await expect(service.assertQuotaEvenements('mgr-1')).rejects.toThrow(ForbiddenException);
  });

  it('compte AUSSI les brouillons et les annulés — ils occupent leur slug et leurs données', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'FREE' });
    prisma.event.count.mockResolvedValue(1);

    await expect(service.assertQuotaEvenements('mgr-1')).rejects.toThrow(ForbiddenException);
    // Aucun filtre de statut : le compte porte sur tous les événements du manager.
    expect(prisma.event.count).toHaveBeenCalledWith({ where: { managerId: 'mgr-1' } });
  });
});

describe('EventAccessService.plafondScanners()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventAccessService;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new EventAccessService(prisma as never, audit as never);
  });

  it('suit le palier quand aucune dérogation n’est posée', async () => {
    prisma.event.findUnique.mockResolvedValue({ maxScanners: null, manager: { plan: 'FREE' } });
    await expect(service.plafondScanners('evt-1')).resolves.toBe(3);

    prisma.event.findUnique.mockResolvedValue({ maxScanners: null, manager: { plan: 'PREMIUM' } });
    await expect(service.plafondScanners('evt-1')).resolves.toBe(6);
  });

  it('respecte une dérogation de l’Admin, au-dessus comme en dessous du palier', async () => {
    prisma.event.findUnique.mockResolvedValue({ maxScanners: 12, manager: { plan: 'FREE' } });
    await expect(service.plafondScanners('evt-1')).resolves.toBe(12);

    prisma.event.findUnique.mockResolvedValue({ maxScanners: 1, manager: { plan: 'PREMIUM' } });
    await expect(service.plafondScanners('evt-1')).resolves.toBe(1);
  });

  it('distingue une dérogation à ZÉRO d’une absence de dérogation', async () => {
    // `0` est falsy : un test négligent le confondrait avec `null` et
    // accorderait 6 agents à un événement dont on voulait fermer le contrôle.
    prisma.event.findUnique.mockResolvedValue({ maxScanners: 0, manager: { plan: 'PREMIUM' } });
    await expect(service.plafondScanners('evt-1')).resolves.toBe(0);
  });
});

describe('EventAccessService.changerRegimeAcces()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventAccessService;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new EventAccessService(prisma as never, audit as never);
  });

  it('refuse de retirer la billetterie quand des places ont été payées', async () => {
    prisma.event.findUnique.mockResolvedValue({ accessMode: 'TICKETED_ACCOUNT' });
    prisma.order.count.mockResolvedValue(12);

    const err = await erreurDe(service.changerRegimeAcces('evt-1', 'RSVP', 'mgr-1'));

    expect(err.code).toBe(ErrorCodes.EVENT_ACCESS_MODE_LOCKED);
    expect(err.details).toEqual({ commandesPayees: 12 });
    // Rien ne doit avoir bougé en base.
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('laisse retirer la billetterie tant que rien n’a été vendu', async () => {
    prisma.event.findUnique.mockResolvedValue({ accessMode: 'TICKETED_GUEST' });
    prisma.order.count.mockResolvedValue(0);

    const r = await service.changerRegimeAcces('evt-1', 'RSVP', 'mgr-1');

    expect(r).toEqual({ avant: 'TICKETED_GUEST', apres: 'RSVP', commandesPayees: 0 });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { accessMode: 'RSVP' },
    });
  });

  it('laisse passer d’un régime billetterie à l’autre, même avec des ventes', async () => {
    // On ne retire la billetterie à personne : on cesse seulement d’exiger
    // un compte. Les acheteurs existants gardent le leur.
    prisma.event.findUnique.mockResolvedValue({ accessMode: 'TICKETED_ACCOUNT' });
    prisma.order.count.mockResolvedValue(40);

    await expect(service.changerRegimeAcces('evt-1', 'TICKETED_GUEST', 'mgr-1')).resolves.toMatchObject({
      apres: 'TICKETED_GUEST',
    });
  });

  it('laisse une inscription devenir une billetterie', async () => {
    prisma.event.findUnique.mockResolvedValue({ accessMode: 'RSVP' });

    await expect(service.changerRegimeAcces('evt-1', 'TICKETED_ACCOUNT', 'mgr-1')).resolves.toMatchObject({
      avant: 'RSVP',
    });
  });

  it('consigne la bascule, avec le nombre de commandes du moment', async () => {
    prisma.event.findUnique.mockResolvedValue({ accessMode: 'TICKETED_ACCOUNT' });
    prisma.order.count.mockResolvedValue(7);

    await service.changerRegimeAcces('evt-1', 'TICKETED_GUEST', 'mgr-9');

    expect(audit.log).toHaveBeenCalledWith(
      'event.access_mode.changed',
      'Event',
      'evt-1',
      { avant: 'TICKETED_ACCOUNT', apres: 'TICKETED_GUEST', commandesPayees: 7 },
      'mgr-9',
    );
  });

  it('n’écrit rien et ne consigne rien quand le régime ne change pas', async () => {
    prisma.event.findUnique.mockResolvedValue({ accessMode: 'RSVP' });

    await service.changerRegimeAcces('evt-1', 'RSVP', 'mgr-1');

    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
