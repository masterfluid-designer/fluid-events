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

/**
 * Code de vérification (2026-08-21). Ce canal a remplacé WhatsApp, resté muet
 * faute de template approuvé par Meta — et qui laissait tous les Manager sans
 * moyen de se vérifier depuis le 16 août.
 */
describe('SmsService.sendVerificationCodeSms()', () => {
  beforeEach(() => {
    createMock.mockClear();
    twilioFactoryMock.mockClear();
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token-123';
    process.env.TWILIO_SMS_FROM = '+15017122661';
  });

  it('envoie le code, et le place en tête du message', async () => {
    const { SmsService } = await import('./sms.service');
    const service = new SmsService();

    await service.sendVerificationCodeSms({ to: '+22890000000', code: '418209' });

    const envoi = createMock.mock.calls[0][0];
    expect(envoi.to).toBe('+22890000000');
    expect(envoi.from).toBe('+15017122661');
    // Sur un écran de verrouillage, seule la première ligne est lue : le code
    // doit y être, pas après une formule de politesse.
    expect(envoi.body.startsWith('418209')).toBe(true);
  });

  it('ne met aucun lien dans le message', async () => {
    const { SmsService } = await import('./sms.service');
    const service = new SmsService();

    await service.sendVerificationCodeSms({ to: '+22890000000', code: '123456' });

    // Un SMS de vérification contenant un lien ressemble à une arnaque — et
    // c'est précisément le message que les arnaques imitent.
    expect(createMock.mock.calls[0][0].body).not.toMatch(/https?:/);
  });

  it('LÈVE quand Twilio n’est pas configuré, au lieu de faire semblant', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    const { SmsService, CanalSmsIndisponibleError } = await import('./sms.service');
    const service = new SmsService();

    // Les autres envois de ce service sont accessoires et avalent leurs
    // erreurs. Celui-ci ne peut pas : la personne attend le code devant son
    // écran. L'avaler la ferait patienter pour rien.
    await expect(
      service.sendVerificationCodeSms({ to: '+22890000000', code: '123456' }),
    ).rejects.toBeInstanceOf(CanalSmsIndisponibleError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('propage un échec Twilio', async () => {
    const { SmsService } = await import('./sms.service');
    const service = new SmsService();
    createMock.mockRejectedValueOnce(new Error('numéro invalide'));

    await expect(
      service.sendVerificationCodeSms({ to: '+22890000000', code: '123456' }),
    ).rejects.toThrow('numéro invalide');
  });
});
