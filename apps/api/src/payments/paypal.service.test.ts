/**
 * Tests unitaires — PayPalService (2026-08-22).
 *
 * PayPal ne signe pas ses webhooks : la vérification est un aller-retour vers
 * leur API. Ce qui compte ici, c'est que le doute se tranche toujours par un
 * refus — une commande confirmée à tort ne se rattrape pas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayPalService } from './paypal.service';

const credentials = {
  clientId: 'id',
  clientSecret: 'secret',
  webhookId: 'wh-1',
  environment: 'sandbox' as const,
};

const entetes = {
  'paypal-transmission-id': 'tr-1',
  'paypal-transmission-time': '2026-08-22T15:00:00Z',
  'paypal-transmission-sig': 'sig',
  'paypal-cert-url': 'https://api.paypal.com/cert',
  'paypal-auth-algo': 'SHA256withRSA',
};

describe('PayPalService.formaterMontant()', () => {
  it("écrit le franc CFA sans décimale — PayPal refuse « 15000.00 »", () => {
    expect(PayPalService.formaterMontant(15000, 'XOF')).toBe('15000');
    expect(PayPalService.formaterMontant(15000, 'xof')).toBe('15000');
  });

  it('écrit deux décimales pour les devises qui en ont', () => {
    expect(PayPalService.formaterMontant(24.5, 'EUR')).toBe('24.50');
    expect(PayPalService.formaterMontant(10, 'USD')).toBe('10.00');
  });
});

describe('PayPalService.initPayment()', () => {
  let service: PayPalService;

  beforeEach(() => {
    service = new PayPalService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const params = {
    description: 'Concert FESTA 2026',
    amount: 15000,
    currency: 'XOF',
    returnUrl: 'https://fluidevent.online/e/festa?resume=1',
    cancelUrl: 'https://fluidevent.online/e/festa',
    orderId: 'ord-1',
  };

  /** Première réponse : le jeton. Deuxième : la commande. */
  function stubFetch(reponses: Array<{ ok?: boolean; status?: number; corps: unknown }>) {
    const espion = vi.fn();
    for (const r of reponses) {
      espion.mockResolvedValueOnce({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => r.corps,
      });
    }
    vi.stubGlobal('fetch', espion);
    return espion;
  }

  it("renvoie l'identifiant de commande et l'URL d'approbation", async () => {
    stubFetch([
      { corps: { access_token: 'jeton' } },
      {
        corps: {
          id: 'PP-1',
          links: [
            { rel: 'self', href: 'https://api/self' },
            { rel: 'approve', href: 'https://paypal.com/approve/PP-1' },
          ],
        },
      },
    ]);

    const r = await service.initPayment(credentials, params);

    expect(r).toEqual({ paypalOrderId: 'PP-1', approveUrl: 'https://paypal.com/approve/PP-1' });
  });

  it('envoie le franc CFA sans décimale, et porte notre identifiant', async () => {
    const espion = stubFetch([
      { corps: { access_token: 'jeton' } },
      { corps: { id: 'PP-1', links: [{ rel: 'approve', href: 'https://x' }] } },
    ]);

    await service.initPayment(credentials, params);

    const corps = JSON.parse(espion.mock.calls[1][1].body as string);
    expect(corps.purchase_units[0].amount.value).toBe('15000');
    expect(corps.purchase_units[0].custom_id).toBe('ord-1');
  });

  it('vise le bac à sable ou la production selon l’environnement', async () => {
    stubFetch([
      { corps: { access_token: 'j' } },
      { corps: { id: 'PP-1', links: [{ rel: 'approve', href: 'https://x' }] } },
    ]);
    await service.initPayment(credentials, params);
    expect((globalThis.fetch as never as { mock: { calls: string[][] } }).mock.calls[0][0]).toContain(
      'sandbox',
    );

    vi.unstubAllGlobals();
    stubFetch([
      { corps: { access_token: 'j' } },
      { corps: { id: 'PP-1', links: [{ rel: 'approve', href: 'https://x' }] } },
    ]);
    await service.initPayment({ ...credentials, environment: 'live' }, params);
    expect(
      (globalThis.fetch as never as { mock: { calls: string[][] } }).mock.calls[0][0],
    ).not.toContain('sandbox');
  });

  it("échoue si aucun lien d'approbation ne revient — on n'invente pas d'URL", async () => {
    stubFetch([
      { corps: { access_token: 'jeton' } },
      { corps: { id: 'PP-1', links: [{ rel: 'self', href: 'https://api/self' }] } },
    ]);

    await expect(service.initPayment(credentials, params)).rejects.toThrow();
  });

  it("remonte l'échec d'authentification", async () => {
    stubFetch([{ ok: false, status: 401, corps: { error_description: 'Client Authentication failed' } }]);

    await expect(service.initPayment(credentials, params)).rejects.toThrow(/Client Authentication/);
  });
});

describe('PayPalService.verifierWebhook()', () => {
  let service: PayPalService;

  beforeEach(() => {
    service = new PayPalService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepte quand PayPal répond SUCCESS', async () => {
    const espion = vi.fn();
    espion.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'j' }) });
    espion.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ verification_status: 'SUCCESS' }),
    });
    vi.stubGlobal('fetch', espion);

    await expect(service.verifierWebhook(credentials, entetes, { id: 'evt' })).resolves.toBe(true);
  });

  it('refuse quand PayPal répond FAILURE', async () => {
    const espion = vi.fn();
    espion.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'j' }) });
    espion.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ verification_status: 'FAILURE' }),
    });
    vi.stubGlobal('fetch', espion);

    await expect(service.verifierWebhook(credentials, entetes, { id: 'evt' })).resolves.toBe(false);
  });

  it("refuse dès qu'un en-tête de transmission manque", async () => {
    const espion = vi.fn();
    vi.stubGlobal('fetch', espion);

    const incomplets = { ...entetes, 'paypal-transmission-sig': undefined };
    await expect(service.verifierWebhook(credentials, incomplets, {})).resolves.toBe(false);
    // On n'appelle même pas PayPal : rien à vérifier.
    expect(espion).not.toHaveBeenCalled();
  });

  it('refuse en cas de panne réseau — le doute se tranche par un refus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(service.verifierWebhook(credentials, entetes, { id: 'evt' })).resolves.toBe(false);
  });

  it('transmet bien le webhookId configuré, sans quoi la vérification est creuse', async () => {
    const espion = vi.fn();
    espion.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'j' }) });
    espion.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ verification_status: 'SUCCESS' }),
    });
    vi.stubGlobal('fetch', espion);

    await service.verifierWebhook(credentials, entetes, { id: 'evt' });

    const corps = JSON.parse(espion.mock.calls[1][1].body as string);
    expect(corps.webhook_id).toBe('wh-1');
    expect(corps.webhook_event).toEqual({ id: 'evt' });
  });
});
