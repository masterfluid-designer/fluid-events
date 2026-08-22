/**
 * Tests unitaires — StripeService (2026-08-22).
 *
 * Deux choses peuvent coûter cher ici : réclamer cent fois le montant dû, et
 * accepter un webhook que Stripe n'a pas signé. Ce fichier garde les deux.
 */
import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StripeService } from './stripe.service';

const credentials = { secretKey: 'sk_test_xxx', webhookSecret: 'whsec_secret' };

describe('StripeService.versPlusPetiteUnite()', () => {
  it("n'applique AUCUN facteur au franc CFA", () => {
    // 15 000 F envoyés comme 1 500 000 réclameraient cent fois la somme due.
    expect(StripeService.versPlusPetiteUnite(15000, 'XOF')).toBe(15000);
    expect(StripeService.versPlusPetiteUnite(15000, 'xof')).toBe(15000);
  });

  it('multiplie par cent les devises à sous-unité', () => {
    expect(StripeService.versPlusPetiteUnite(24.5, 'EUR')).toBe(2450);
    expect(StripeService.versPlusPetiteUnite(10, 'USD')).toBe(1000);
  });

  it('couvre les autres devises sans décimale de la zone', () => {
    expect(StripeService.versPlusPetiteUnite(5000, 'XAF')).toBe(5000);
    expect(StripeService.versPlusPetiteUnite(300, 'GNF')).toBe(300);
  });

  it('arrondit plutôt que de laisser passer un centime fractionnaire', () => {
    expect(StripeService.versPlusPetiteUnite(19.999, 'EUR')).toBe(2000);
  });
});

describe('StripeService.initPayment()', () => {
  let service: StripeService;

  beforeEach(() => {
    service = new StripeService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(reponse: unknown, ok = true, status = 200) {
    const espion = vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => reponse,
    });
    vi.stubGlobal('fetch', espion);
    return espion;
  }

  const params = {
    description: 'Concert FESTA 2026',
    amount: 15000,
    currency: 'XOF',
    successUrl: 'https://fluidevent.online/e/festa?resume=1',
    cancelUrl: 'https://fluidevent.online/e/festa',
    orderId: 'ord-1',
    customerEmail: 'ama@example.com',
  };

  it('ouvre une session et renvoie son URL', async () => {
    stubFetch({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    const r = await service.initPayment(credentials, params);

    expect(r).toEqual({
      sessionId: 'cs_test_1',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
  });

  it('envoie le montant SANS facteur pour le franc CFA', async () => {
    const espion = stubFetch({ id: 'cs_1', url: 'https://x' });

    await service.initPayment(credentials, params);

    const corps = new URLSearchParams(espion.mock.calls[0][1].body as string);
    expect(corps.get('line_items[0][price_data][unit_amount]')).toBe('15000');
    expect(corps.get('line_items[0][price_data][currency]')).toBe('xof');
  });

  it('porte notre identifiant de commande, pour ne pas croire le navigateur au retour', async () => {
    const espion = stubFetch({ id: 'cs_1', url: 'https://x' });

    await service.initPayment(credentials, params);

    const corps = new URLSearchParams(espion.mock.calls[0][1].body as string);
    expect(corps.get('client_reference_id')).toBe('ord-1');
    expect(corps.get('metadata[orderId]')).toBe('ord-1');
  });

  it('remonte une erreur explicite quand Stripe refuse', async () => {
    stubFetch({ error: { message: 'No such price' } }, false, 400);

    await expect(service.initPayment(credentials, params)).rejects.toThrow(/No such price/);
  });

  it("n'invente pas d'URL quand la réponse est incomplète", async () => {
    stubFetch({ id: 'cs_1' });

    await expect(service.initPayment(credentials, params)).rejects.toThrow();
  });
});

describe('StripeService.verifierSignature()', () => {
  const service = new StripeService();
  const corps = '{"type":"checkout.session.completed"}';

  function signer(horodatage: number, secret = credentials.webhookSecret, charge = corps) {
    const signature = createHmac('sha256', secret).update(`${horodatage}.${charge}`).digest('hex');
    return `t=${horodatage},v1=${signature}`;
  }

  it('accepte une signature valide et récente', () => {
    const maintenant = Date.now();
    const entete = signer(Math.floor(maintenant / 1000));

    expect(service.verifierSignature(corps, entete, credentials.webhookSecret, maintenant)).toBe(true);
  });

  it('refuse une signature produite avec un autre secret', () => {
    const maintenant = Date.now();
    const entete = signer(Math.floor(maintenant / 1000), 'whsec_autre');

    expect(service.verifierSignature(corps, entete, credentials.webhookSecret, maintenant)).toBe(false);
  });

  it('refuse un corps modifié après signature', () => {
    const maintenant = Date.now();
    const entete = signer(Math.floor(maintenant / 1000));

    const falsifie = '{"type":"checkout.session.completed","amount":1}';
    expect(
      service.verifierSignature(falsifie, entete, credentials.webhookSecret, maintenant),
    ).toBe(false);
  });

  it('refuse un appel trop ancien — sinon un webhook capturé se rejoue à jamais', () => {
    const maintenant = Date.now();
    const vieux = Math.floor(maintenant / 1000) - 600;

    expect(service.verifierSignature(corps, signer(vieux), credentials.webhookSecret, maintenant)).toBe(
      false,
    );
  });

  it('refuse un en-tête absent, vide ou mal formé', () => {
    const maintenant = Date.now();
    expect(service.verifierSignature(corps, undefined, credentials.webhookSecret, maintenant)).toBe(false);
    expect(service.verifierSignature(corps, '', credentials.webhookSecret, maintenant)).toBe(false);
    expect(service.verifierSignature(corps, 'nimporte quoi', credentials.webhookSecret, maintenant)).toBe(
      false,
    );
    expect(service.verifierSignature(corps, 't=123', credentials.webhookSecret, maintenant)).toBe(false);
  });

  it('refuse quand aucun secret n’est configuré — surtout pas « tout accepter »', () => {
    const maintenant = Date.now();
    expect(service.verifierSignature(corps, signer(Math.floor(maintenant / 1000)), '', maintenant)).toBe(
      false,
    );
  });
});
