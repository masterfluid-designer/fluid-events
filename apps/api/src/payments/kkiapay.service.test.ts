/**
 * Tests unitaires — KkiapayService
 * Vérifie le mapping des credentials vers le SDK officiel + le passthrough
 * de la réponse de vérification (anti-fraude serveur, doc Kkiapay).
 */
import { describe, it, expect, vi } from 'vitest';

const verifyMock = vi.fn();
const kkiapayFactoryMock = vi.fn((config: unknown) => ({ verify: verifyMock, refund: vi.fn() }));

vi.mock('@kkiapay-org/nodejs-sdk', () => ({
  kkiapay: (config: unknown) => kkiapayFactoryMock(config),
}));

describe('KkiapayService.verifyTransaction()', () => {
  it('instancie le SDK avec les bonnes clés mappées et retourne la vérification', async () => {
    const { KkiapayService } = await import('./kkiapay.service');
    verifyMock.mockResolvedValue({
      status: 'SUCCESS',
      amount: 5000,
      transactionId: 'tx-1',
      client: { fullname: 'Jean Dupont', phone: '+22890000000', email: 'jean@x.com' },
    });

    const service = new KkiapayService();
    const result = await service.verifyTransaction(
      { publicKey: 'pub', privateKey: 'priv', secretKey: 'sec', sandbox: true },
      'tx-1',
    );

    expect(kkiapayFactoryMock).toHaveBeenCalledWith({
      publickey: 'pub',
      privatekey: 'priv',
      secretkey: 'sec',
      sandbox: true,
    });
    expect(verifyMock).toHaveBeenCalledWith('tx-1');
    expect(result.status).toBe('SUCCESS');
    expect(result.amount).toBe(5000);
  });

  it('propage une erreur si la transaction est introuvable (SDK throw)', async () => {
    const { KkiapayService } = await import('./kkiapay.service');
    verifyMock.mockRejectedValue(new Error('Transaction Not Found'));

    const service = new KkiapayService();
    await expect(
      service.verifyTransaction(
        { publicKey: 'pub', privateKey: 'priv', secretKey: 'sec', sandbox: true },
        'unknown-tx',
      ),
    ).rejects.toThrow('Transaction Not Found');
  });
});
