/**
 * Tests unitaires — CinetPayService
 * API REST pure (pas de SDK officiel) : init, vérification, calcul HMAC x-token.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CinetPayService, computeCinetPayHmac } from './cinetpay.service';

const CREDENTIALS = { apiKey: 'apikey-123', siteId: 'site-456', secretKey: 'hmac-secret' };

describe('CinetPayService.initPayment()', () => {
  let service: CinetPayService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new CinetPayService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retourne paymentToken/paymentUrl sur succès (code 201)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          code: '201',
          message: 'CREATED',
          data: { payment_token: 'tok-1', payment_url: 'https://checkout.cinetpay.com/payment/tok-1' },
        }),
    }) as any;

    const result = await service.initPayment(CREDENTIALS, {
      transactionId: 'tx-1',
      amount: 5000,
      currency: 'XOF',
      description: 'Billet VIP',
      notifyUrl: 'https://api.example.com/webhook/cinetpay',
      returnUrl: 'https://app.example.com/return',
    });

    expect(result).toEqual({ paymentToken: 'tok-1', paymentUrl: 'https://checkout.cinetpay.com/payment/tok-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-checkout.cinetpay.com/v2/payment',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"apikey":"apikey-123"'),
      }),
    );
  });

  it('lève une erreur explicite si CinetPay renvoie un code différent de 201', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ code: '600', message: 'INVALID_SITE_ID' }),
    }) as any;

    await expect(
      service.initPayment(CREDENTIALS, {
        transactionId: 'tx-1',
        amount: 5000,
        currency: 'XOF',
        description: 'Billet',
        notifyUrl: 'https://x.com/webhook',
        returnUrl: 'https://x.com/return',
      }),
    ).rejects.toThrow(/CinetPay init échoué/);
  });
});

describe('CinetPayService.checkTransaction()', () => {
  let service: CinetPayService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new CinetPayService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retourne le statut/montant/devise de la transaction', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ code: '00', data: { status: 'ACCEPTED', amount: '5000', currency: 'XOF' } }),
    }) as any;

    const result = await service.checkTransaction(CREDENTIALS, 'tx-1');

    expect(result).toEqual({ status: 'ACCEPTED', amount: 5000, currency: 'XOF' });
  });

  it("retourne UNKNOWN si data absente (réponse inattendue)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ code: '600' }) }) as any;

    const result = await service.checkTransaction(CREDENTIALS, 'tx-1');

    expect(result.status).toBe('UNKNOWN');
  });
});

describe('computeCinetPayHmac()', () => {
  it('calcule un HMAC-SHA256 déterministe sur la concaténation des champs documentés', () => {
    const payload = {
      cpm_site_id: 'site-456',
      cpm_trans_id: 'tx-1',
      cpm_trans_date: '20260713120000',
      cpm_amount: '5000',
      cpm_currency: 'XOF',
      signature: 'sig-abc',
      payment_method: 'MOBILE_MONEY',
      cel_phone_num: '22990000000',
      cpm_phone_prefixe: '229',
      cpm_language: 'fr',
      cpm_version: 'V2',
      cpm_payment_config: 'SINGLE',
      cpm_page_action: 'PAYMENT',
      cpm_custom: '',
      cpm_designation: 'Billet VIP',
      cpm_error_message: '',
    };

    const hmac1 = computeCinetPayHmac(payload, 'hmac-secret');
    const hmac2 = computeCinetPayHmac(payload, 'hmac-secret');

    expect(hmac1).toBe(hmac2);
    expect(hmac1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produit un HMAC différent si un seul champ change', () => {
    const base = {
      cpm_site_id: 'site-456',
      cpm_trans_id: 'tx-1',
      cpm_trans_date: '20260713120000',
      cpm_amount: '5000',
      cpm_currency: 'XOF',
    };

    const hmacA = computeCinetPayHmac(base, 'hmac-secret');
    const hmacB = computeCinetPayHmac({ ...base, cpm_amount: '9999' }, 'hmac-secret');

    expect(hmacA).not.toBe(hmacB);
  });

  it('produit un HMAC différent avec un secret différent (le secret doit réellement participer au calcul)', () => {
    const payload = { cpm_trans_id: 'tx-1', cpm_amount: '5000' };

    expect(computeCinetPayHmac(payload, 'secret-A')).not.toBe(computeCinetPayHmac(payload, 'secret-B'));
  });

  it('traite les champs manquants comme une chaîne vide (pas de crash)', () => {
    expect(() => computeCinetPayHmac({}, 'hmac-secret')).not.toThrow();
  });
});
