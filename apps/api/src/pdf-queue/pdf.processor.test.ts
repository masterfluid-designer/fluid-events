/**
 * Tests unitaires — PdfProcessor
 * Orchestration du rendu PDF (Puppeteer mocké) + upload S3 (CDC ADR §3) +
 * email "billets prêts" une fois tous les OrderItem de la commande générés.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  client: { name: 'Jean Dupont', email: 'jean@example.com' },
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
  return { prisma, ticketDesignService, storageService, audit, emailService };
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
    const { PdfProcessor } = await import('./pdf.processor');
    const deps = makeDeps();
    const processor = new PdfProcessor(
      deps.prisma as any,
      deps.ticketDesignService as any,
      deps.storageService as any,
      deps.audit as any,
      deps.emailService as any,
    );

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
    const { PdfProcessor } = await import('./pdf.processor');
    const deps = makeDeps();
    pdfMock.mockRejectedValueOnce(new Error('render failed'));
    const processor = new PdfProcessor(
      deps.prisma as any,
      deps.ticketDesignService as any,
      deps.storageService as any,
      deps.audit as any,
      deps.emailService as any,
    );

    await expect(processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any)).rejects.toThrow(
      'render failed',
    );
    expect(closeMock).toHaveBeenCalled();
    expect(deps.storageService.uploadBuffer).not.toHaveBeenCalled();
    expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
  });

  it('abandonne proprement si l\'OrderItem ou le QR est manquant (pas de crash)', async () => {
    const { PdfProcessor } = await import('./pdf.processor');
    const deps = makeDeps({ orderItem: null });
    const processor = new PdfProcessor(
      deps.prisma as any,
      deps.ticketDesignService as any,
      deps.storageService as any,
      deps.audit as any,
      deps.emailService as any,
    );

    await processor.handleGenerate({ data: { orderItemId: 'unknown' } } as any);

    expect(launchMock).not.toHaveBeenCalled();
    expect(deps.storageService.uploadBuffer).not.toHaveBeenCalled();
    expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
  });

  describe('email "billets prêts" (décision produit 2026-07-14)', () => {
    it('envoie l\'email une fois que tous les OrderItem de la commande ont leur PDF (commande à 1 billet)', async () => {
      const { PdfProcessor } = await import('./pdf.processor');
      const deps = makeDeps();
      const processor = new PdfProcessor(
        deps.prisma as any,
        deps.ticketDesignService as any,
        deps.storageService as any,
        deps.audit as any,
        deps.emailService as any,
      );

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
    }, 15000);

    it("n'envoie PAS l'email tant qu'un autre OrderItem de la même commande n'a pas encore son PDF", async () => {
      const { PdfProcessor } = await import('./pdf.processor');
      const deps = makeDeps({
        order: {
          orderNumber: 'ORD-1',
          event: { title: 'Concert FESTA 2026' },
          client: { name: 'Jean Dupont', email: 'jean@example.com' },
          items: [
            { qrCodeUrl: 'http://storage/tickets/oi-1.pdf', ticket: { name: 'VIP Or' } },
            { qrCodeUrl: null, ticket: { name: 'Standard' } },
          ],
        },
      });
      const processor = new PdfProcessor(
        deps.prisma as any,
        deps.ticketDesignService as any,
        deps.storageService as any,
        deps.audit as any,
        deps.emailService as any,
      );

      await processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any);

      expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
    }, 15000);

    it('envoie un seul email récapitulatif avec tous les billets quand ils sont tous prêts', async () => {
      const { PdfProcessor } = await import('./pdf.processor');
      const deps = makeDeps({
        order: {
          orderNumber: 'ORD-1',
          event: { title: 'Concert FESTA 2026' },
          client: { name: 'Jean Dupont', email: 'jean@example.com' },
          items: [
            { qrCodeUrl: 'http://storage/tickets/oi-1.pdf', ticket: { name: 'VIP Or' } },
            { qrCodeUrl: 'http://storage/tickets/oi-2.pdf', ticket: { name: 'Standard' } },
          ],
        },
      });
      const processor = new PdfProcessor(
        deps.prisma as any,
        deps.ticketDesignService as any,
        deps.storageService as any,
        deps.audit as any,
        deps.emailService as any,
      );

      await processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any);

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
      const { PdfProcessor } = await import('./pdf.processor');
      const deps = makeDeps({ order: null });
      const processor = new PdfProcessor(
        deps.prisma as any,
        deps.ticketDesignService as any,
        deps.storageService as any,
        deps.audit as any,
        deps.emailService as any,
      );

      await expect(
        processor.handleGenerate({ data: { orderItemId: 'oi-1' } } as any),
      ).resolves.toBeUndefined();
      expect(deps.emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
    }, 15000);
  });
});
