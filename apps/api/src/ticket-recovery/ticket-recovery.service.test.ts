import { describe, it, expect, vi } from 'vitest';
import { TicketRecoveryService } from './ticket-recovery.service';

const PAID_ORDER = {
  id: 'order-1',
  orderNumber: 'ORD-ABC123',
  status: 'PAID',
  client: { email: 'client@x.com', name: 'Jean Dupont' },
  event: { title: 'Concert FESTA 2026' },
  items: [
    { qrCodeUrl: 'http://storage/tickets/oi-1.pdf', ticket: { name: 'VIP' } },
    { qrCodeUrl: 'http://storage/tickets/oi-2.pdf', ticket: { name: 'Standard' } },
  ],
};

function makeService(order: any) {
  const prisma = { order: { findUnique: vi.fn().mockResolvedValue(order) } };
  const emailService = { sendTicketReadyEmail: vi.fn().mockResolvedValue(undefined) };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const service = new TicketRecoveryService(prisma as any, emailService as any, audit as any);
  return { service, prisma, emailService, audit };
}

describe('TicketRecoveryService.recoverTickets()', () => {
  it("renvoie l'email de confirmation quand la commande et l'email correspondent", async () => {
    const { service, emailService, audit } = makeService(PAID_ORDER);

    await service.recoverTickets({ orderNumber: 'ORD-ABC123', email: 'client@x.com' });

    expect(emailService.sendTicketReadyEmail).toHaveBeenCalledWith({
      to: 'client@x.com',
      clientName: 'Jean Dupont',
      eventTitle: 'Concert FESTA 2026',
      orderNumber: 'ORD-ABC123',
      items: [
        { ticketName: 'VIP', qrCodeUrl: 'http://storage/tickets/oi-1.pdf' },
        { ticketName: 'Standard', qrCodeUrl: 'http://storage/tickets/oi-2.pdf' },
      ],
    });
    expect(audit.log).toHaveBeenCalledWith(
      'ticket.recovery.requested',
      'Order',
      'order-1',
      expect.objectContaining({ matched: true }),
    );
  });

  it("email insensible à la casse/espaces", async () => {
    const { service, emailService } = makeService(PAID_ORDER);

    await service.recoverTickets({ orderNumber: 'ORD-ABC123', email: '  CLIENT@X.COM  ' });

    expect(emailService.sendTicketReadyEmail).toHaveBeenCalled();
  });

  it("n'envoie rien si l'email ne correspond pas — mais toujours logué (pas d'énumération)", async () => {
    const { service, emailService, audit } = makeService(PAID_ORDER);

    await service.recoverTickets({ orderNumber: 'ORD-ABC123', email: 'quelquun-dautre@x.com' });

    expect(emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      'ticket.recovery.requested',
      'Order',
      null,
      expect.objectContaining({ matched: false }),
    );
  });

  it("n'envoie rien si la commande n'existe pas", async () => {
    const { service, emailService, audit } = makeService(null);

    await service.recoverTickets({ orderNumber: 'unknown', email: 'client@x.com' });

    expect(emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      'ticket.recovery.requested',
      'Order',
      null,
      expect.objectContaining({ matched: false }),
    );
  });

  it("n'envoie rien si la commande n'est pas encore payée (PENDING/FAILED)", async () => {
    const { service, emailService } = makeService({ ...PAID_ORDER, status: 'PENDING' });

    await service.recoverTickets({ orderNumber: 'ORD-ABC123', email: 'client@x.com' });

    expect(emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
  });

  it("commande payée mais PDF pas encore généré (qrCodeUrl absent) → pas d'email, pas d'erreur", async () => {
    const { service, emailService } = makeService({
      ...PAID_ORDER,
      items: [{ qrCodeUrl: null, ticket: { name: 'VIP' } }],
    });

    await service.recoverTickets({ orderNumber: 'ORD-ABC123', email: 'client@x.com' });

    expect(emailService.sendTicketReadyEmail).not.toHaveBeenCalled();
  });
});
