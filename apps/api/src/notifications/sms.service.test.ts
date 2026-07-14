/**
 * Tests unitaires — SmsService
 * Client Twilio mocké.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn().mockResolvedValue({ sid: 'SM123' });
const twilioClientMock = { messages: { create: (...args: unknown[]) => createMock(...args) } };
const twilioFactoryMock = vi.fn().mockReturnValue(twilioClientMock);

vi.mock('twilio', () => ({
  default: (...args: unknown[]) => twilioFactoryMock(...args),
}));

describe('SmsService.sendTicketReadySms()', () => {
  beforeEach(() => {
    createMock.mockClear();
    twilioFactoryMock.mockClear();
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token-123';
    process.env.TWILIO_SMS_FROM = '+15017122661';
  });

  it('appelle Twilio avec le bon numéro expéditeur/destinataire et un message contenant les infos de commande', async () => {
    const { SmsService } = await import('./sms.service');
    const service = new SmsService();

    await service.sendTicketReadySms({
      to: '+22890000000',
      eventTitle: 'Concert FESTA 2026',
      orderNumber: 'ORD-1',
    });

    expect(twilioFactoryMock).toHaveBeenCalledWith('AC123', 'token-123');
    expect(createMock).toHaveBeenCalledWith({
      to: '+22890000000',
      from: '+15017122661',
      body: expect.stringContaining('Concert FESTA 2026'),
    });
    expect(createMock.mock.calls[0][0].body).toContain('ORD-1');
  });

  it("ne relance jamais d'exception si Twilio rejette l'appel (best-effort)", async () => {
    createMock.mockRejectedValueOnce(new Error('Authentication Error'));
    const { SmsService } = await import('./sms.service');
    const service = new SmsService();

    await expect(
      service.sendTicketReadySms({
        to: '+22890000000',
        eventTitle: 'Concert',
        orderNumber: 'ORD-1',
      }),
    ).resolves.toBeUndefined();
  });

  it("n'appelle pas Twilio si TWILIO_ACCOUNT_SID/AUTH_TOKEN/SMS_FROM est absent (non configuré)", async () => {
    delete process.env.TWILIO_SMS_FROM;
    const { SmsService } = await import('./sms.service');
    const service = new SmsService();

    await service.sendTicketReadySms({
      to: '+22890000000',
      eventTitle: 'Concert',
      orderNumber: 'ORD-1',
    });

    expect(twilioFactoryMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
