/**
 * Tests unitaires — TicketAccessService (lot 1, 2026-08-22).
 *
 * Ce lien remplace le tableau de bord pour un acheteur sans compte. Il doit
 * ouvrir UNE commande, et rien d'autre — ni le compte, ni l'identité de
 * l'acheteur, ni une commande voisine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TicketAccessService } from './ticket-access.service';

/** JwtService factice : signe et vérifie sans clé, mais respecte `exp`. */
function makeJwt() {
  return {
    sign: vi.fn((charge: Record<string, unknown>) => JSON.stringify(charge)),
    verify: vi.fn((jeton: string) => {
      const charge = JSON.parse(jeton) as { exp?: number };
      if (charge.exp && charge.exp * 1000 < Date.now()) throw new Error('jwt expired');
      return charge;
    }),
  };
}

const commande = {
  id: 'ord-1',
  orderNumber: 'ORD-0001',
  status: 'PAID',
  totalAmount: { toString: () => '15000' },
  currency: 'XOF',
  paidAt: new Date('2026-08-01'),
  event: {
    title: 'Concert FESTA',
    slug: 'concert-festa',
    startDate: new Date('2026-12-31'),
    venueName: 'Green Palace',
    city: 'Lomé',
  },
  items: [
    { id: 'it-1', isScanned: false, qrCode: 'QR1', ticket: { name: 'Standard' } },
  ],
};

function makePrisma() {
  return {
    order: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'ord-1',
        event: { endDate: new Date('2026-12-31T23:00:00Z') },
      }),
    },
  };
}

describe('TicketAccessService.creerJeton()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let jwt: ReturnType<typeof makeJwt>;
  let service: TicketAccessService;

  beforeEach(() => {
    prisma = makePrisma();
    jwt = makeJwt();
    service = new TicketAccessService(prisma as never, jwt as never);
  });

  it('marque le jeton comme un jeton de billet, et porte la commande', async () => {
    await service.creerJeton('ord-1');

    const charge = jwt.sign.mock.calls[0][0];
    expect(charge.orderId).toBe('ord-1');
    expect(charge.typ).toBe('ticket');
  });

  it("expire APRÈS l'événement, pas après l'achat", async () => {
    await service.creerJeton('ord-1');

    const { exp } = jwt.sign.mock.calls[0][0] as { exp: number };
    const finEvenement = new Date('2026-12-31T23:00:00Z').getTime() / 1000;
    expect(exp).toBeGreaterThan(finEvenement);
  });

  it('donne quand même un délai utile pour un événement déjà passé', async () => {
    // Sinon l'acheteur d'un billet de dernière minute reçoit un lien mort.
    prisma.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      event: { endDate: new Date('2020-01-01') },
    });

    await service.creerJeton('ord-1');

    const { exp } = jwt.sign.mock.calls[0][0] as { exp: number };
    expect(exp * 1000).toBeGreaterThan(Date.now());
  });

  it('refuse une commande inconnue', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.creerJeton('ord-absent')).rejects.toThrow(NotFoundException);
  });
});

describe('TicketAccessService.lireCommande()', () => {
  let prisma: { order: { findUnique: ReturnType<typeof vi.fn> } };
  let jwt: ReturnType<typeof makeJwt>;
  let service: TicketAccessService;

  beforeEach(() => {
    jwt = makeJwt();
    prisma = { order: { findUnique: vi.fn().mockResolvedValue(commande) } };
    service = new TicketAccessService(prisma as never, jwt as never);
  });

  it('ouvre la commande que le jeton désigne', async () => {
    const r = await service.lireCommande(JSON.stringify({ orderId: 'ord-1', typ: 'ticket' }));

    expect(r.id).toBe('ord-1');
    expect(r.items[0]).toMatchObject({ ticketName: 'Standard', hasTicket: true });
  });

  it("ne laisse sortir ni l'email ni le nom de l'acheteur", async () => {
    // Le lien se transfère, se retrouve dans un fil de discussion, s'ouvre sur
    // un téléphone prêté : il montre le billet, pas qui l'a acheté.
    const r = await service.lireCommande(JSON.stringify({ orderId: 'ord-1', typ: 'ticket' }));

    const rendu = JSON.stringify(r);
    expect(rendu).not.toMatch(/@/);
    expect(r).not.toHaveProperty('clientId');
    expect(r).not.toHaveProperty('client');
  });

  it("refuse un jeton d'un autre type — un JWT de session n'ouvre pas un billet", async () => {
    await expect(
      service.lireCommande(JSON.stringify({ orderId: 'ord-1', typ: 'session', sub: 'u-1' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuse un jeton expiré', async () => {
    const expire = JSON.stringify({
      orderId: 'ord-1',
      typ: 'ticket',
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    await expect(service.lireCommande(expire)).rejects.toThrow(NotFoundException);
  });

  it('refuse un jeton illisible', async () => {
    await expect(service.lireCommande('pas-un-jeton')).rejects.toThrow(NotFoundException);
  });

  it('répond la MÊME chose pour toutes les anomalies — sinon on renseigne qui en fabrique', async () => {
    const messages: string[] = [];

    for (const jeton of [
      'pas-un-jeton',
      JSON.stringify({ orderId: 'ord-1', typ: 'session' }),
      JSON.stringify({ orderId: 'ord-1', typ: 'ticket', exp: 1 }),
    ]) {
      messages.push(await service.lireCommande(jeton).catch((e) => e.response.message));
    }

    prisma.order.findUnique.mockResolvedValue(null);
    messages.push(
      await service
        .lireCommande(JSON.stringify({ orderId: 'ord-absent', typ: 'ticket' }))
        .catch((e) => e.response.message),
    );

    expect(new Set(messages).size).toBe(1);
  });
});
