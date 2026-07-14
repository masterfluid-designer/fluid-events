/**
 * Tests unitaires — EmailService
 * nodemailer mocké : vérifie le contenu envoyé et la résilience (jamais de
 * throw même si le transport échoue — RULES.md, ne doit jamais bloquer la
 * génération du billet).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'fake-id' });
const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });

vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
}));

describe('EmailService.sendTicketReadyEmail()', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_FROM = 'noreply@fluid-events.dev';
  });

  it('envoie un email avec le sujet, le destinataire et les liens de téléchargement', async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await service.sendTicketReadyEmail({
      to: 'client@example.com',
      clientName: 'Jean Dupont',
      eventTitle: 'Concert FESTA 2026',
      orderNumber: 'ORD-1',
      items: [{ ticketName: 'VIP Or', qrCodeUrl: 'http://storage/tickets/oi-1.pdf' }],
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@fluid-events.dev',
        to: 'client@example.com',
        subject: 'Vos billets pour Concert FESTA 2026',
        html: expect.stringContaining('http://storage/tickets/oi-1.pdf'),
      }),
    );
    expect(sendMailMock.mock.calls[0][0].html).toContain('VIP Or');
    expect(sendMailMock.mock.calls[0][0].html).toContain('ORD-1');
  });

  it('inclut un lien par billet quand la commande contient plusieurs OrderItem', async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await service.sendTicketReadyEmail({
      to: 'client@example.com',
      clientName: 'Jean Dupont',
      eventTitle: 'Concert FESTA 2026',
      orderNumber: 'ORD-1',
      items: [
        { ticketName: 'VIP Or', qrCodeUrl: 'http://storage/tickets/oi-1.pdf' },
        { ticketName: 'Standard', qrCodeUrl: 'http://storage/tickets/oi-2.pdf' },
      ],
    });

    const html = sendMailMock.mock.calls[0][0].html;
    expect(html).toContain('http://storage/tickets/oi-1.pdf');
    expect(html).toContain('http://storage/tickets/oi-2.pdf');
  });

  it("échappe le HTML dans les champs saisis par l'utilisateur (nom, titre)", async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await service.sendTicketReadyEmail({
      to: 'client@example.com',
      clientName: '<script>alert(1)</script>',
      eventTitle: 'Concert',
      orderNumber: 'ORD-1',
      items: [{ ticketName: 'VIP', qrCodeUrl: 'http://storage/x.pdf' }],
    });

    const html = sendMailMock.mock.calls[0][0].html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it("ne relance jamais d'exception si l'envoi échoue (best-effort)", async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP down'));
    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await expect(
      service.sendTicketReadyEmail({
        to: 'client@example.com',
        clientName: 'Jean',
        eventTitle: 'Concert',
        orderNumber: 'ORD-1',
        items: [{ ticketName: 'VIP', qrCodeUrl: 'http://storage/x.pdf' }],
      }),
    ).resolves.toBeUndefined();
  });

  it('configure le transport nodemailer depuis les variables SMTP_*', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASSWORD = 'pass';

    const { EmailService } = await import('./email.service');
    new EmailService();

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: true,
        auth: { user: 'user', pass: 'pass' },
      }),
    );
  });
});
