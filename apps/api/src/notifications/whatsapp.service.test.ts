/**
 * Tests unitaires — WhatsappService
 * fetch mocké (comme CinetPayService — pas de SDK officiel côté Meta Cloud API).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappService.sendTicketReadyMessage()', () => {
  let service: WhatsappService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new WhatsappService({ log: vi.fn().mockResolvedValue(undefined) } as any);
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-123';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '111222333';
    process.env.WHATSAPP_API_VERSION = 'v21.0';
    process.env.WHATSAPP_TICKET_READY_TEMPLATE_NAME = 'ticket_ready';
    process.env.WHATSAPP_TICKET_READY_TEMPLATE_LANG = 'fr';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("appelle l'API Meta Cloud avec le bon endpoint, la bonne auth et le bon template", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.ABC' }] }),
    }) as any;

    await service.sendTicketReadyMessage({
      to: '22890000000',
      clientName: 'Jean Dupont',
      eventTitle: 'Concert FESTA 2026',
      orderNumber: 'ORD-1',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/111222333/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '22890000000',
      type: 'template',
      template: {
        name: 'ticket_ready',
        language: { code: 'fr' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Jean Dupont' },
              { type: 'text', text: 'Concert FESTA 2026' },
              { type: 'text', text: 'ORD-1' },
            ],
          },
        ],
      },
    });
  });

  it("ne relance jamais d'exception si l'API répond une erreur (best-effort)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({ error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } }),
    }) as any;

    await expect(
      service.sendTicketReadyMessage({
        to: '22890000000',
        clientName: 'Jean',
        eventTitle: 'Concert',
        orderNumber: 'ORD-1',
      }),
    ).resolves.toBeUndefined();
  });

  it("ne relance jamais d'exception si le réseau échoue (best-effort)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;

    await expect(
      service.sendTicketReadyMessage({
        to: '22890000000',
        clientName: 'Jean',
        eventTitle: 'Concert',
        orderNumber: 'ORD-1',
      }),
    ).resolves.toBeUndefined();
  });

  it("n'appelle pas l'API si WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID est absent (non configuré)", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    global.fetch = vi.fn() as any;

    await service.sendTicketReadyMessage({
      to: '22890000000',
      clientName: 'Jean',
      eventTitle: 'Concert',
      orderNumber: 'ORD-1',
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('WhatsappService.sendVerificationCode()', () => {
  let service: WhatsappService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new WhatsappService({ log: vi.fn().mockResolvedValue(undefined) } as any);
    process.env.WHATSAPP_ACCESS_TOKEN = 'token-123';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '111222333';
    process.env.WHATSAPP_API_VERSION = 'v21.0';
    process.env.WHATSAPP_VERIFICATION_TEMPLATE_NAME = 'phone_verification';
    process.env.WHATSAPP_VERIFICATION_TEMPLATE_LANG = 'fr';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("appelle l'API Meta Cloud avec le code dans le body ET le bouton (template AUTHENTICATION)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.OTP' }] }),
    }) as any;

    await service.sendVerificationCode({ to: '22890000000', code: '123456' });

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '22890000000',
      type: 'template',
      template: {
        name: 'phone_verification',
        language: { code: 'fr' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
        ],
      },
    });
  });

  it("PROPAGE l'erreur si l'API répond en échec (contrairement à sendTicketReadyMessage)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Invalid OAuth access token' } }),
    }) as any;

    await expect(service.sendVerificationCode({ to: '22890000000', code: '123456' })).rejects.toThrow(
      'Invalid OAuth access token',
    );
  });

  it("PROPAGE l'erreur si le réseau échoue", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;

    await expect(service.sendVerificationCode({ to: '22890000000', code: '123456' })).rejects.toThrow(
      'network down',
    );
  });

  it("PROPAGE une erreur explicite si WhatsApp n'est pas configuré (pas un envoi silencieux ignoré)", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    global.fetch = vi.fn() as any;

    await expect(service.sendVerificationCode({ to: '22890000000', code: '123456' })).rejects.toThrow(
      /non configuré/,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
