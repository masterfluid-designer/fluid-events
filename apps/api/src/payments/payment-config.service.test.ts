/**
 * Tests — l'encaissement réglé par l'organisateur (2026-08-24).
 *
 * Deux propriétés valent tout le reste : **aucune clé ne ressort** d'une
 * lecture, et **l'événement vient du contrôle d'appartenance**, jamais de la
 * requête telle quelle. Ni l'une ni l'autre ne se voit à l'écran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCodes, PaymentProviderType } from '@saas-events/types';
import { PaymentConfigService } from './payment-config.service';

function makePrisma() {
  const tx = {
    paymentProviderConfig: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    tx,
    event: { findMany: vi.fn().mockResolvedValue([]) },
    paymentProviderConfig: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: 'cfg-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

const DTO = {
  provider: PaymentProviderType.KKIAPAY,
  publicKey: 'pk_visible',
  privateKey: 'sk_tres_secret',
  webhookSecret: 'whsec_tres_secret',
  environment: 'sandbox' as const,
  isActive: true,
};

function corps(err: unknown): { code?: string; message?: string } {
  return (err as { response: Record<string, unknown> }).response as never;
}

describe('PaymentConfigService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let crypto: { encrypt: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let acces: { resoudreEvenementDuManager: ReturnType<typeof vi.fn> };
  let service: PaymentConfigService;

  beforeEach(() => {
    prisma = makePrisma();
    crypto = { encrypt: vi.fn((v: string) => `chiffre(${v})`) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    acces = { resoudreEvenementDuManager: vi.fn().mockResolvedValue('evt-1') };
    service = new PaymentConfigService(
      prisma as never,
      crypto as never,
      audit as never,
      acces as never,
    );
  });

  describe('lister()', () => {
    /*
     * LE test de la lecture. « Une fois soumis, on ne peut plus l'afficher » :
     * si `publicKey` revenait dans le select, la promesse tomberait sans que
     * rien ne casse.
     */
    it('ne demande aucune clé à la base, pas même la publique', async () => {
      await service.lister('mgr-1', 'evt-demande');

      const select = prisma.paymentProviderConfig.findMany.mock.calls[0][0].select;
      expect(select.publicKey).toBeUndefined();
      expect(select.privateKey).toBeUndefined();
      expect(select.webhookSecret).toBeUndefined();
      // Ce qui reste : de quoi savoir qu'une config existe, et laquelle.
      expect(select.provider).toBe(true);
      expect(select.isActive).toBe(true);
      expect(select.isGlobal).toBe(true);
    });

    it("passe par le contrôle d'appartenance et lit l'événement RÉSOLU", async () => {
      await service.lister('mgr-1', 'evt-demande');

      expect(acces.resoudreEvenementDuManager).toHaveBeenCalledWith('mgr-1', 'evt-demande');
      expect(prisma.paymentProviderConfig.findMany.mock.calls[0][0].where).toEqual({
        eventId: 'evt-1',
      });
    });

    it("laisse remonter le refus quand l'événement n'est pas le sien", async () => {
      acces.resoudreEvenementDuManager.mockRejectedValue(new NotFoundException());

      await expect(service.lister('mgr-1', 'evt-autre')).rejects.toThrow(NotFoundException);
    });
  });

  describe('enregistrer()', () => {
    it('chiffre le secret serveur et le secret webhook', async () => {
      await service.enregistrer('mgr-1', DTO);

      expect(crypto.encrypt).toHaveBeenCalledWith('sk_tres_secret');
      expect(crypto.encrypt).toHaveBeenCalledWith('whsec_tres_secret');

      const ecrit = prisma.tx.paymentProviderConfig.upsert.mock.calls[0][0].create;
      expect(ecrit.privateKey).toBe('chiffre(sk_tres_secret)');
      expect(ecrit.webhookSecret).toBe('chiffre(whsec_tres_secret)');
      // La clé publique n'est pas un secret : elle part au widget côté client.
      expect(ecrit.publicKey).toBe('pk_visible');
    });

    it('n’écrit que sur l’événement courant sans le drapeau global', async () => {
      await service.enregistrer('mgr-1', DTO);

      expect(prisma.event.findMany).not.toHaveBeenCalled();
      expect(prisma.tx.paymentProviderConfig.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.tx.paymentProviderConfig.upsert.mock.calls[0][0].where).toEqual({
        eventId_provider: { eventId: 'evt-1', provider: PaymentProviderType.KKIAPAY },
      });
    });

    it('recopie sur tous les événements du manager avec le drapeau global', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }, { id: 'evt-3' }]);

      await service.enregistrer('mgr-1', { ...DTO, global: true });

      expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({ managerId: 'mgr-1' });
      expect(prisma.tx.paymentProviderConfig.upsert).toHaveBeenCalledTimes(3);
      expect(prisma.tx.paymentProviderConfig.upsert.mock.calls[0][0].create.isGlobal).toBe(true);
    });

    /*
     * Un seul fournisseur encaisse à la fois, et la désactivation des autres
     * vit DANS la transaction : sortie de là, une coupure laisserait deux
     * fournisseurs actifs et le tunnel en choisirait un au hasard.
     */
    it('désactive les autres fournisseurs, dans la même transaction', async () => {
      await service.enregistrer('mgr-1', DTO);

      expect(prisma.tx.paymentProviderConfig.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', provider: { not: PaymentProviderType.KKIAPAY } },
        data: { isActive: false },
      });
    });

    it('ne désactive rien quand on enregistre sans activer', async () => {
      await service.enregistrer('mgr-1', { ...DTO, isActive: false });

      expect(prisma.tx.paymentProviderConfig.updateMany).not.toHaveBeenCalled();
    });

    /* RULES.md §9 : jamais un fragment d'identifiant dans le journal. */
    it('journalise la portée, jamais les identifiants', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }]);

      await service.enregistrer('mgr-1', { ...DTO, global: true });

      const [, , , details] = audit.log.mock.calls[0];
      expect(details).toEqual(
        expect.objectContaining({ provider: 'KKIAPAY', global: true, evenementsTouches: 2 }),
      );
      const journal = JSON.stringify(details);
      expect(journal).not.toContain('sk_tres_secret');
      expect(journal).not.toContain('whsec_tres_secret');
      expect(journal).not.toContain('pk_visible');
    });

    it("refuse d'activer un fournisseur dont l'exécution n'est pas branchée", async () => {
      const err = await service
        .enregistrer('mgr-1', { ...DTO, provider: 'MONNAIE_DE_SINGE' as never })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(corps(err).code).toBe(ErrorCodes.PROVIDER_EXECUTION_NOT_SUPPORTED);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /*
     * Stripe et PayPal manquaient à la liste des fournisseurs exécutables alors
     * que leur code tournait depuis le 2026-08-22 : leurs clés s'enregistraient
     * et refusaient de s'activer, sans que rien ne dise pourquoi.
     */
    it('accepte Stripe et PayPal, dont l’exécution est branchée', async () => {
      for (const provider of [PaymentProviderType.STRIPE, PaymentProviderType.PAYPAL]) {
        await expect(service.enregistrer('mgr-1', { ...DTO, provider })).resolves.toBeDefined();
      }
    });
  });

  describe('basculer()', () => {
    it('refuse d’activer un fournisseur jamais configuré', async () => {
      prisma.paymentProviderConfig.findUnique.mockResolvedValue(null);

      const err = await service
        .basculer('mgr-1', PaymentProviderType.KKIAPAY, true)
        .catch((e) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('désactive sans exiger que le fournisseur soit exécutable', async () => {
      await expect(
        service.basculer('mgr-1', 'MONNAIE_DE_SINGE' as never, false),
      ).resolves.toBeDefined();
    });
  });

  describe('heriterDesConfigsGlobales()', () => {
    it('recopie une seule ligne par fournisseur, la plus récente', async () => {
      prisma.paymentProviderConfig.findMany.mockResolvedValue([
        { provider: 'KKIAPAY', isActive: true, publicKey: 'pk', privateKey: 'x', webhookSecret: 'y', config: null },
        { provider: 'KKIAPAY', isActive: false, publicKey: 'ancien', privateKey: 'x', webhookSecret: 'y', config: null },
        { provider: 'STRIPE', isActive: false, publicKey: null, privateKey: 'x', webhookSecret: 'y', config: null },
      ]);

      const n = await service.heriterDesConfigsGlobales('mgr-1', 'evt-neuf');

      expect(n).toBe(2);
      const lignes = prisma.paymentProviderConfig.createMany.mock.calls[0][0].data;
      expect(lignes).toHaveLength(2);
      expect(lignes[0].publicKey).toBe('pk');
      expect(lignes.every((l: { isGlobal: boolean }) => l.isGlobal)).toBe(true);
    });

    it('ne cherche que les configs GLOBALES du manager', async () => {
      await service.heriterDesConfigsGlobales('mgr-1', 'evt-neuf');

      expect(prisma.paymentProviderConfig.findMany.mock.calls[0][0].where).toEqual({
        isGlobal: true,
        event: { managerId: 'mgr-1' },
      });
    });

    it('n’écrit rien quand le manager n’a aucune config globale', async () => {
      prisma.paymentProviderConfig.findMany.mockResolvedValue([]);

      const n = await service.heriterDesConfigsGlobales('mgr-1', 'evt-neuf');

      expect(n).toBe(0);
      expect(prisma.paymentProviderConfig.createMany).not.toHaveBeenCalled();
    });

    /*
     * Best-effort : refuser une soirée parce que des clés n'ont pas pu être
     * recopiées serait absurde, et « Mes événements » signale déjà un
     * événement publié sans encaissement.
     */
    it('avale son échec plutôt que de faire échouer la création', async () => {
      prisma.paymentProviderConfig.findMany.mockRejectedValue(new Error('base indisponible'));

      await expect(service.heriterDesConfigsGlobales('mgr-1', 'evt-neuf')).resolves.toBe(0);
    });
  });
});
