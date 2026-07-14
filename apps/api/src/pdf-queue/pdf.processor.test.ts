/**
 * Tests unitaires — PdfProcessor
 * Orchestration du rendu PDF (Puppeteer mocké) + upload S3 (CDC ADR §3) +
 * notifications "billets prêts" (email + WhatsApp) une fois tous les
 * OrderItem de la commande générés.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfProcessor } from './pdf.processor';

const setContentMock = vi.fn().mockResolvedValue(undefined);
const pdfMock = vi.fn().mockResolvedValue(Buffer.from('pdf-bytes'));
const closeMock = vi.fn().mockResolvedValue(undefined);
const newPageMock = vi.fn().mockResolvedValue({ setContent: setContentMock, pdf: pdfMock });
const launchMock = vi.fn().mockResolvedValue({ newPage: newPageMock, close: closeMock });

vi.mock('puppeteer', () => ({ default: { launch: (...args: unknown[]) => launchMock(...args) } }));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake-qr') },
}));

const ORDER_ITEM = {
  id: 'oi-1',
  qrCode: 'signed-jwt-token',
  ticket: { name: 'VIP Or', designImageUrl: null, designBgColor: '#d4ac0d' },
  order: {
    id: 'order-1',
    orderNumber: 'ORD-1',
    event: { title: 'Concert FESTA 2026' },
    client: { name: 'Jean Dupont', phone: '+22890000000' },
  },
};

/** Commande avec un seul OrderItem, déjà prêt après l'upload de ce test. */
const ORDER_ALL_READY = {
  orderNumber: 'ORD-1',
  event: { title: 'Concert FESTA 2026' },
  client: { name: 'Jean Dupont', email: 'jean@example.com', phone: '+22890000000' },
  items: [{ qrCodeUrl: 'http://storage/tickets/oi-1.pdf', ticket: { name: 'VIP Or' } }],
};

function makeDeps(overrides: { orderItem?: any; order?: any } = {}) {
  const orderItem = 'orderItem' in overrides ? overrides.orderItem : ORDER_ITEM;
  const order = 'order' in overrides ? overrides.order : ORDER_ALL_READY;
  const prisma = {
    orderItem: {
      findUnique: vi.fn().mockResolvedValue(orderItem),
      update: vi.fn().mockResolvedValue({}),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue(order),
    },
  };
  const ticketDesignService = { buildHtml: vi.fn().mockReturnValue('<html>ticket</html>') };
  const storageService = { uploadBuffer: vi.fn().mockResolvedValue('http://storage/tickets/oi-1.pdf') };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const emailService = { sendTicketReadyEmail: vi.fn().mockResolvedValue(undefined) };
  const whatsappService = { sendTicketReadyMessage: vi.fn().mockResolvedValue(undefined) };
  const phoneService = {
    normalizeForWhatsapp: vi.fn((raw: string | null | undefined) =>
      raw ? raw.replace('+', '') : null,
    ),
  };
  return { prisma, ticketDesignService, storageService, audit, emailService, whatsappService, phoneService };
}

function makeProcessor(deps: ReturnType<typeof makeDeps>) {
  return new PdfProcessor(
    deps.prisma as any,
    deps.ticketDesignService as any,
    deps.storageService as any,
    deps.audit as any,
    deps.emailService as any,
    deps.whatsappService as any,
    deps.phoneService as any,
  );
}

describe('PdfProcessor.handleGenerate()', () => {
  beforeEach(() => {
    launchMock.mockClear();
    newPageMock.mockClear();
    setContentMock.mockClear();
    pdfMock.mockClear();
    closeMock.mockClear();
  });

  it('génère le HTML, rend le PDF via Puppeteer, uploade et met à jour OrderItem.qrCodeUrl', async () => {
    // Timeout généreux : sous forte charge (nombreux fichiers de test en
    // parallèle), le scheduling async peut dépasser les 5000ms par défaut
    // même avec Puppeteer entièrement mocké.
    const deps = makeDeps();
    const processor = makeProcessor(deps);

    await processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any);

    expect(deps.ticketDesignService.buildHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Concert FESTA 2026',
        ticketType: 'VIP Or',
        orderNumber: 'ORD-1',
        clientName: 'Jean Dupont',
        clientPhone: '+22890000000',
        qrCodeBase64: 'data:image/png;base64,fake-qr',
      }),
    );
    expect(launchMock).toHaveBeenCalled();
    expect(setContentMock).toHaveBeenCalledWith('<html>ticket</html>', expect.any(Object));
    expect(closeMock).toHaveBeenCalled();
    expect(deps.storageService.uploadBuffer).toHaveBeenCalledWith(
      'tickets/oi-1.pdf',
      expect.any(Buffer),
      'application/pdf',
    );
    expect(deps.prisma.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'oi-1' },
      data: { qrCodeUrl: 'http://storage/tickets/oi-1.pdf' },
    });
    expect(deps.audit.log).toHaveBeenCalledWith(
      'ticket.pdf.generated',
      'OrderItem',
      'oi-1',
      expect.objectContaining({ url: 'http://storage/tickets/oi-1.pdf' }),
    );
  }, 15000);

  it('ferme le navigateur même si le rendu échoue', async () => {
    const deps = makeDeps();
    pdfMock.mockRejectedValueOnce(new Error('render failed'));
    const processor = makeProcessor(deps);

    await expect(processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any)).rejects.toThrow(
      'render failed',
    );
    expect(closeMock).toHaveBeenCalled();
    expect(deps.storageService.uploadBuffer).not.toHaveBeenCalled();
    expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
    expect(deps.whatsappService.sendTicketReadyMessage).not.toHaveBeenCalled();
  });

  it('abandonne proprement si l\'OrderItem ou le QR est manquant (pas de crash)', async () => {
    const deps = makeDeps({ orderItem: null });
    const processor = makeProcessor(deps);

    await processor.handleGenerate({ data: { orderItemId: 'unknown' } } as any);

    expect(launchMock).not.toHaveBeenCalled();
    expect(deps.storageService.uploadBuffer).not.toHaveBeenCalled();
    expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
    expect(deps.whatsappService.sendTicketReadyMessage).not.toHaveBeenCalled();
  });

  describe('notifications "billets prêts" (décision produit 2026-07-14)', () => {
    it('envoie email + WhatsApp une fois que tous les OrderItem de la commande ont leur PDF (commande à 1 billet)', async () => {
      const deps = makeDeps();
      const processor = makeProcessor(deps);

      await processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any);

      expect(deps.prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
      expect(deps.emailService.sendTicketReadyEmail).toHaveBeenCalledWith({
        to: 'jean@example.com',
        clientName: 'Jean Dupont',
        eventTitle: 'Concert FESTA 2026',
        orderNumber: 'ORD-1',
        items: [{ ticketName: 'VIP Or', qrCodeUrl: 'http://storage/tickets/oi-1.pdf' }],
      });
      expect(deps.phoneService.normalizeForWhatsapp).toHaveBeenCalledWith('+22890000000');
      expect(deps.whatsappService.sendTicketReadyMessage).toHaveBeenCalledWith({
        to: '22890000000',
        clientName: 'Jean Dupont',
        eventTitle: 'Concert FESTA 2026',
        orderNumber: 'ORD-1',
      });
    }, 15000);

    it("n'envoie AUCUNE notification tant qu'un autre OrderItem de la même commande n'a pas encore son PDF", async () => {
      const deps = makeDeps({
        order: {
          orderNumber: 'ORD-1',
          event: { title: 'Concert FESTA 2026' },
          client: { name: 'Jean Dupont', email: 'jean@example.com', phone: '+22890000000' },
          items: [
            { qrCodeUrl: 'http://storage/tickets/oi-1.pdf', ticket: { name: 'VIP Or' } },
            { qrCodeUrl: null, ticket: { name: 'Standard' } },
          ],
        },
      });
      const processor = makeProcessor(deps);

      await processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any);

      expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
      expect(deps.whatsappService.sendTicketReadyMessage).not.toHaveBeenCalled();
    }, 15000);

    it('envoie une seule notification récapitulative avec tous les billets quand ils sont tous prêts', async () => {
      const deps = makeDeps({
        order: {
          orderNumber: 'ORD-1',
          event: { title: 'Concert FESTA 2026' },
          client: { name: 'Jean Dupont', email: 'jean@example.com', phone: '+22890000000' },
          items: [
            { qrCodeUrl: 'http://storage/tickets/oi-1.pdf', ticket: { name: 'VIP Or' } },
            { qrCodeUrl: 'http://storage/tickets/oi-2.pdf', ticket: { name: 'Standard' } },
          ],
        },
      });
      const processor = makeProcessor(deps);

      await processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any);

      expect(deps.emailService.sendTicketReadyEmail).toHaveBeenCalledTimes(1);
      expect(deps.whatsappService.sendTicketReadyMessage).toHaveBeenCalledTimes(1);
      expect(deps.emailService.sendTicketReadyEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            { ticketName: 'VIP Or', qrCodeUrl: 'http://storage/tickets/oi-1.pdf' },
            { ticketName: 'Standard', qrCodeUrl: 'http://storage/tickets/oi-2.pdf' },
          ],
        }),
      );
    }, 15000);

    it("n'envoie rien si la commande n'est plus trouvée (pas de crash)", async () => {
      const deps = makeDeps({ order: null });
      const processor = makeProcessor(deps);

      await expect(
        processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any),
      ).resolves.toBeUndefined();
      expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
      expect(deps.whatsappService.sendTicketReadyMessage).not.toHaveBeenCalled();
    }, 15000);

    it("n'envoie pas de WhatsApp si le client n'a pas de téléphone valide (envoie quand même l'email)", async () => {
      const deps = makeDeps({
        order: {
          orderNumber: 'ORD-1',
          event: { title: 'Concert FESTA 2026' },
          client: { name: 'Jean Dupont', email: 'jean@example.com', phone: null },
          items: [{ qrCodeUrl: 'http://storage/tickets/oi-1.pdf', ticket: { name: 'VIP Or' } }],
        },
      });
      const processor = makeProcessor(deps);

      await processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any);

      expect(deps.emailService.sendTicketReadyEmail).toHaveBeenCalledTimes(1);
      expect(deps.whatsappService.sendTicketReadyMessage).not.toHaveBeenCalled();
    }, 15000);
  });
});
