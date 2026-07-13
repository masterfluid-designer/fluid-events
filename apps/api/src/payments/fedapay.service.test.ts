/**
 * Tests unitaires — FedaPayService
 * Enveloppe autour du SDK Node officiel `fedapay` (mocké ici) : init
 * (create + generateToken), vérification de statut, signature webhook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateTokenMock = vi.fn();
const createMock = vi.fn();
const retrieveMock = vi.fn();
const constructEventMock = vi.fn();
const setApiKeyMock = vi.fn();
const setEnvironmentMock = vi.fn();

vi.mock('fedapay', () => ({
  FedaPay: {
    setApiKey: (...args: unknown[]) => setApiKeyMock(...args),
    setEnvironment: (...args: unknown[]) => setEnvironmentMock(...args),
  },
  Transaction: {
    create: (...args: unknown[]) => createMock(...args),
    retrieve: (...args: unknown[]) => retrieveMock(...args),
  },
  Webhook: {
    constructEvent: (...args: unknown[]) => constructEventMock(...args),
  },
}));

// vi.mock ci-dessus est hoisté par vitest au-dessus de cet import.
import { FedaPayService } from './fedapay.service';

const CREDENTIALS = { secretKey: 'sk_test_123', environment: 'sandbox' as const };

describe('FedaPayService.initPayment()', () => {
  let service: InstanceType<typeof FedaPayService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FedaPayService();
  });

  it('configure la clé/environnement puis crée la transaction et génère le token', async () => {
    createMock.mockResolvedValue({ id: 42, generateToken: generateTokenMock });
    generateTokenMock.mockResolvedValue({ url: 'https://checkout.fedapay.com/pay/xyz', token: 'tok-xyz' });

    const result = await service.initPayment(CREDENTIALS, {
      description: 'Billet VIP',
      amount: 5000,
      currency: 'XOF',
      callbackUrl: 'https://app.example.com/callback',
    });

    expect(result).toEqual({ transactionId: '42', checkoutUrl: 'https://checkout.fedapay.com/pay/xyz' });
    expect(setApiKeyMock).toHaveBeenCalledWith('sk_test_123');
    expect(setEnvironmentMock).toHaveBeenCalledWith('sandbox');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Billet VIP',
        amount: 5000,
        currency: { iso: 'XOF' },
        callback_url: 'https://app.example.com/callback',
      }),
    );
  });

  it("lève une erreur explicite si generateToken() ne renvoie pas d'URL", async () => {
    createMock.mockResolvedValue({ id: 42, generateToken: generateTokenMock });
    generateTokenMock.mockResolvedValue({ token: 'tok-xyz' });

    await expect(
      service.initPayment(CREDENTIALS, {
        description: 'Billet',
        amount: 5000,
        currency: 'XOF',
        callbackUrl: 'https://app.example.com/callback',
      }),
    ).rejects.toThrow(/n'a pas renvoyé d'URL/);
  });
});

describe('FedaPayService.getTransactionStatus()', () => {
  let service: InstanceType<typeof FedaPayService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FedaPayService();
  });

  it('configure puis retourne le statut/montant de la transaction', async () => {
    retrieveMock.mockResolvedValue({ status: 'approved', amount: 5000 });

    const result = await service.getTransactionStatus(CREDENTIALS, '42');

    expect(result).toEqual({ status: 'approved', amount: 5000 });
    expect(setApiKeyMock).toHaveBeenCalledWith('sk_test_123');
    expect(retrieveMock).toHaveBeenCalledWith('42');
  });
});

describe('FedaPayService.constructWebhookEvent()', () => {
  let service: InstanceType<typeof FedaPayService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FedaPayService();
  });

  it('délègue au SDK officiel (Webhook.constructEvent) sans réimplémenter la vérification', () => {
    constructEventMock.mockReturnValue({ name: 'transaction.approved', object: { id: 42 } });

    const event = service.constructWebhookEvent('{"raw":"body"}', 'sig-header', 'whsec_test');

    expect(event).toEqual({ name: 'transaction.approved', object: { id: 42 } });
    expect(constructEventMock).toHaveBeenCalledWith('{"raw":"body"}', 'sig-header', 'whsec_test');
  });

  it('propage une signature invalide (le SDK lève, on ne l’avale pas silencieusement)', () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    expect(() => service.constructWebhookEvent('body', 'bad-sig', 'whsec_test')).toThrow('Invalid signature');
  });
});
