/**
 * Tests unitaires — EmailService
 * Deux transports mockés (nodemailer et Resend) : vérifie le choix du
 * transport selon RESEND_API_KEY, le contenu envoyé, et la résilience
 * (jamais de throw même si l'envoi échoue — RULES.md, ne doit jamais
 * bloquer la génération du billet).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'fake-id' });
const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });
const resendSendMock = vi.fn().mockResolvedValue({ data: { id: 'resend-id' }, error: null });

vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: (...args: unknown[]) => resendSendMock(...args) } })),
}));

describe('EmailService.sendTicketReadyEmail() — transport SMTP (dev, sans RESEND_API_KEY)', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
    resendSendMock.mockClear();
    delete process.env.RESEND_API_KEY;
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
    expect(resendSendMock).not.toHaveBeenCalled();
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

describe('EmailService.sendTicketReadyEmail() — transport Resend (prod, RESEND_API_KEY présent)', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
    resendSendMock.mockClear();
    resendSendMock.mockResolvedValue({ data: { id: 'resend-id' }, error: null });
    process.env.RESEND_API_KEY = 're_test_123';
    process.env.SMTP_FROM = 'noreply@fluid-events.dev';
  });

  it('utilise Resend plutôt que nodemailer quand RESEND_API_KEY est configuré', async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await service.sendTicketReadyEmail({
      to: 'client@example.com',
      clientName: 'Jean Dupont',
      eventTitle: 'Concert FESTA 2026',
      orderNumber: 'ORD-1',
      items: [{ ticketName: 'VIP Or', qrCodeUrl: 'http://storage/tickets/oi-1.pdf' }],
    });

    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@fluid-events.dev',
        to: 'client@example.com',
        subject: 'Vos billets pour Concert FESTA 2026',
        html: expect.stringContaining('http://storage/tickets/oi-1.pdf'),
      }),
    );
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("ne relance jamais d'exception si Resend renvoie { error } (best-effort)", async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Domain not verified', name: 'validation_error' },
    });
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

  it("ne relance jamais d'exception si l'appel Resend rejette (best-effort)", async () => {
    resendSendMock.mockRejectedValueOnce(new Error('network down'));
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
});

describe('EmailService.sendManagerInviteEmail()', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    createTransportMock.mockClear();
    resendSendMock.mockClear();
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_FROM = 'noreply@fluid-events.dev';
  });

  it("envoie un email avec le lien d'invitation", async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await service.sendManagerInviteEmail({
      to: 'manager@example.com',
      name: 'Jean Dupont',
      inviteUrl: 'http://localhost:3000/auth/set-password?token=abc123',
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manager@example.com',
        subject: 'Invitation à rejoindre Fluid Events',
        html: expect.stringContaining('http://localhost:3000/auth/set-password?token=abc123'),
      }),
    );
  });

  it("propage l'erreur à l'appelant si l'envoi échoue (contrairement à sendTicketReadyEmail)", async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP down'));
    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await expect(
      service.sendManagerInviteEmail({
        to: 'manager@example.com',
        name: 'Jean',
        inviteUrl: 'http://localhost:3000/auth/set-password?token=abc123',
      }),
    ).rejects.toThrow('SMTP down');
  });
});
