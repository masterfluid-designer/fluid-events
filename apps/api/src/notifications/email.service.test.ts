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
const mockAudit = { log: vi.fn().mockResolvedValue(undefined) } as any;

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
    const service = new EmailService(mockAudit);

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
    const service = new EmailService(mockAudit);

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
    const service = new EmailService(mockAudit);

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
    const service = new EmailService(mockAudit);

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
    new EmailService(mockAudit);

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
    const service = new EmailService(mockAudit);

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
    const service = new EmailService(mockAudit);

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
    const service = new EmailService(mockAudit);

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
    const service = new EmailService(mockAudit);

    await service.sendManagerInviteEmail({
      to: 'manager@example.com',
      name: 'Jean Dupont',
      inviteUrl: 'http://localhost:3000/auth/set-password?token=abc123',
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manager@example.com',
        subject: 'Bienvenue sur Fluid Events, Jean Dupont — votre espace organisateur est ouvert',
        html: expect.stringContaining('http://localhost:3000/auth/set-password?token=abc123'),
      }),
    );
  });

  /*
   * Ce que l'ancien message NE disait pas, et qui a motivé sa réécriture le
   * 2026-08-20 : où revenir après avoir choisi son mot de passe, et qui
   * joindre. Sans ce test, la prochaine retouche pourrait les faire
   * disparaître sans que rien ne le signale.
   */
  it('donne au nouveau manager les adresses pour se retrouver', async () => {
    process.env.APP_URL = 'https://fluidevent.online';
    // APP_URL est figé au CHARGEMENT du module : sans ce reset, l'import mis
    // en cache par les tests précédents garderait l'ancienne valeur.
    vi.resetModules();
    const { EmailService } = await import('./email.service');
    const service = new EmailService(mockAudit);

    await service.sendManagerInviteEmail({
      to: 'manager@example.com',
      name: 'Jean Dupont',
      inviteUrl: 'https://fluidevent.online/auth/set-password?token=abc123',
    });

    const html = sendMailMock.mock.calls[0][0].html as string;
    for (const chemin of ['/manager', '/auth/login', '/docs', '/support']) {
      expect(html).toContain(`https://fluidevent.online${chemin}`);
    }
    // L'expiration doit rester dite : c'est elle qui explique un lien mort.
    expect(html).toContain('7 jours');
  });


  /*
   * Le briefing du 2026-08-23. Ces chiffres sont la seule source que
   * l'organisateur a sous la main : s'ils s'effacent d'une retouche, il
   * découvrira son plafond en s’y heurtant.
   */
  it('annonce les limites du palier et ce que Premium ajoute', async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService(mockAudit);

    await service.sendManagerInviteEmail({
      to: 'manager@example.com',
      name: 'Jean Dupont',
      inviteUrl: 'https://fluidevent.online/auth/set-password?token=abc123',
    });

    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain('compte simple');
    expect(html).toContain('Premium');
    // Les quatre plafonds : événements, types en parallèle, agents, multi-jours.
    expect(html).toContain('Événements en cours');
    expect(html).toContain('Agents de contrôle par événement');
    expect(html).toContain('Événement sur plusieurs journées');
    // Les trois régimes doivent être nommés, pas seulement suggérés.
    expect(html).toContain('inscription simple');
    expect(html).toContain('billetterie sans compte');
    expect(html).toContain('billetterie avec compte client');
  });

  /*
   * L'encaissement se branche côté Admin. Un manager qui publie sans le
   * savoir met en ligne une billetterie incapable de vendre — le défaut le
   * plus coûteux de la plateforme.
   */
  it('prévient que l’encaissement se branche avant la publication', async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService(mockAudit);

    await service.sendManagerInviteEmail({
      to: 'manager@example.com',
      name: 'Jean Dupont',
      inviteUrl: 'https://fluidevent.online/auth/set-password?token=abc123',
    });

    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain('avant de publier');
  });

  it('met en avant la colonne du palier réellement accordé', async () => {
    const { EmailService } = await import('./email.service');
    const service = new EmailService(mockAudit);

    await service.sendManagerInviteEmail({
      to: 'manager@example.com',
      name: 'Jean Dupont',
      inviteUrl: 'https://fluidevent.online/auth/set-password?token=abc123',
      plan: 'PREMIUM',
    });

    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain('Votre compte démarre en <strong style="color:#1c1b1a">Premium</strong>');
    expect(html).not.toContain('Voici ce que cela autorise');
  });

  it("propage l'erreur à l'appelant si l'envoi échoue (contrairement à sendTicketReadyEmail)", async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP down'));
    const { EmailService } = await import('./email.service');
    const service = new EmailService(mockAudit);

    await expect(
      service.sendManagerInviteEmail({
        to: 'manager@example.com',
        name: 'Jean',
        inviteUrl: 'http://localhost:3000/auth/set-password?token=abc123',
      }),
    ).rejects.toThrow('SMTP down');
  });
});
