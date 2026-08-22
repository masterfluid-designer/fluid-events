/**
 * Tests unitaires — suppression complète d'un manager (2026-08-22).
 *
 * C'est le geste le plus destructeur de la plateforme : il emporte des
 * commandes payées et des billets que des gens ont achetés. Ce fichier garde
 * ses deux verrous — la confirmation par adresse, et l'impossibilité de se
 * supprimer soi-même — et vérifie que la trace de ce qui s'est passé survit au
 * compte effacé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@saas-events/types';
import { AdminService } from './admin.service';

function makeTx() {
  return {
    scannerLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    orderItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    order: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    registration: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    scanner: {
      findMany: vi.fn().mockResolvedValue([{ userId: 'agent-1' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    event: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    user: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({ id: 'mgr-1' }),
    },
  };
}

function makePrisma(tx: ReturnType<typeof makeTx>) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'mgr-1',
        name: 'Kwame Asante',
        email: 'Kwame@Example.com',
        role: Role.MANAGER,
      }),
    },
    event: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'ev-1', title: 'Concert FESTA', slug: 'concert-festa', status: 'PUBLISHED' },
      ]),
    },
    order: {
      count: vi.fn().mockResolvedValue(187),
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: 2340000 } }),
    },
    orderItem: { count: vi.fn().mockResolvedValue(187) },
    registration: { count: vi.fn().mockResolvedValue(0) },
    scanner: { count: vi.fn().mockResolvedValue(2) },
    $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
}

function corps(err: unknown): { code?: string; message?: string } {
  return (err as { response: Record<string, unknown> }).response as never;
}

describe('AdminService.previewManagerDeletion()', () => {
  it("annonce ce qui sera emporté, SANS rien supprimer", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    const audit = { log: vi.fn().mockResolvedValue(undefined) };
    const service = new AdminService(prisma as never, {} as never, {} as never, audit as never, {} as never, {} as never);

    const apercu = await service.previewManagerDeletion('mgr-1');

    expect(apercu).toMatchObject({
      commandesPayees: 187,
      montantPaye: 2340000,
      billetsVendus: 187,
      agents: 2,
    });
    expect(apercu.evenements).toHaveLength(1);
    // Rien n'a bougé : c'est un aperçu.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("refuse un compte qui n'est pas un manager", async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      name: 'Ama',
      email: 'ama@x.com',
      role: Role.CLIENT,
    });
    const service = new AdminService(prisma as never, {} as never, {} as never, { log: vi.fn() } as never, {} as never, {} as never);

    await expect(service.previewManagerDeletion('u-1')).rejects.toThrow(NotFoundException);
  });
});

describe('AdminService.deleteManagerCompletely()', () => {
  let tx: ReturnType<typeof makeTx>;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: AdminService;

  beforeEach(() => {
    tx = makeTx();
    prisma = makePrisma(tx);
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new AdminService(prisma as never, {} as never, {} as never, audit as never, {} as never, {} as never);
  });

  it('supprime tout quand la confirmation correspond', async () => {
    const r = await service.deleteManagerCompletely('mgr-1', 'kwame@example.com', 'admin-1');

    expect(r).toMatchObject({ deleted: true, evenementsSupprimes: 1, commandesSupprimees: 187 });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'mgr-1' } });
    expect(tx.event.deleteMany).toHaveBeenCalled();
    expect(tx.order.deleteMany).toHaveBeenCalled();
  });

  it('accepte la confirmation quelle que soit la casse ou les espaces', async () => {
    await expect(
      service.deleteManagerCompletely('mgr-1', '  KWAME@example.COM ', 'admin-1'),
    ).resolves.toMatchObject({ deleted: true });
  });

  it("refuse — et ne touche à RIEN — quand la confirmation ne correspond pas", async () => {
    const err = await service
      .deleteManagerCompletely('mgr-1', 'autre@example.com', 'admin-1')
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(corps(err).message).toMatch(/Rien n’a été supprimé/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("empêche un administrateur de se supprimer lui-même", async () => {
    await expect(
      service.deleteManagerCompletely('admin-1', 'kwame@example.com', 'admin-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("consigne l'audit AVANT de supprimer, avec les chiffres emportés", async () => {
    await service.deleteManagerCompletely('mgr-1', 'kwame@example.com', 'admin-1');

    expect(audit.log).toHaveBeenCalledWith(
      'admin.manager.deleted',
      'User',
      'mgr-1',
      expect.objectContaining({
        email: 'Kwame@Example.com',
        commandesPayees: 187,
        montantPaye: 2340000,
      }),
      'admin-1',
    );

    // L'ordre compte : écrit après, il manquerait si la transaction échouait.
    const rangAudit = audit.log.mock.invocationCallOrder[0];
    const rangSuppression = prisma.$transaction.mock.invocationCallOrder[0];
    expect(rangAudit).toBeLessThan(rangSuppression);
  });

  it('DÉTACHE les journaux du manager au lieu de les détruire', async () => {
    // Ce qu'il a fait doit rester consultable après son départ, sans le nommer.
    await service.deleteManagerCompletely('mgr-1', 'kwame@example.com', 'admin-1');

    expect(tx.auditLog.updateMany).toHaveBeenCalledWith({
      where: { userId: 'mgr-1' },
      data: { userId: null },
    });
  });

  it('supprime aussi les comptes des agents de contrôle', async () => {
    // Un agent n'existe que pour un événement : sans lui, son compte n'a plus
    // d'objet, et il ne pourrait de toute façon plus rien scanner.
    await service.deleteManagerCompletely('mgr-1', 'kwame@example.com', 'admin-1');

    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['agent-1'] } } });
  });

  it('ne touche à aucune table de commande quand le manager n’a aucun événement', async () => {
    prisma.event.findMany.mockResolvedValue([]);

    await service.deleteManagerCompletely('mgr-1', 'kwame@example.com', 'admin-1');

    expect(tx.order.deleteMany).not.toHaveBeenCalled();
    expect(tx.event.deleteMany).not.toHaveBeenCalled();
    // Le compte, lui, part bien.
    expect(tx.user.delete).toHaveBeenCalled();
  });
});
