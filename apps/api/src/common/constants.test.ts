import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifierUrlsPubliques } from './constants';

/**
 * Garde de démarrage sur les URLs publiques (2026-08-23).
 *
 * Ce qu'elle empêche est invisible autrement : un email d'invitation parti
 * avec « http://localhost:3000/manager » est déjà chez son destinataire quand
 * on s'en aperçoit. Le test vaut donc surtout pour le jour où quelqu'un
 * trouvera la garde encombrante.
 */
describe('verifierUrlsPubliques()', () => {
  const initial = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://fluidevent.online';
    process.env.FRONTEND_URL = 'https://fluidevent.online';
    process.env.API_URL = 'https://api.fluidevent.online';
  });

  afterEach(() => {
    process.env = { ...initial };
  });

  it('laisse passer des URLs publiques renseignées', () => {
    expect(() => verifierUrlsPubliques()).not.toThrow();
  });

  it('ne se déclenche jamais hors production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.APP_URL;
    process.env.FRONTEND_URL = 'http://localhost:3000';

    expect(() => verifierUrlsPubliques()).not.toThrow();
  });

  it('refuse le démarrage si APP_URL est absente', () => {
    delete process.env.APP_URL;

    expect(() => verifierUrlsPubliques()).toThrow(/APP_URL/);
  });

  /*
   * Le cas le plus vicieux : `??` ne rattrape pas la chaîne vide, donc
   * `APP_URL=` dans le .env produit des liens relatifs — morts dans un client
   * mail, et sans le mot « localhost » pour mettre la puce à l'oreille.
   */
  it('refuse une valeur vide, que le repli `??` ne rattrape pas', () => {
    process.env.APP_URL = '   ';

    expect(() => verifierUrlsPubliques()).toThrow(/APP_URL/);
  });

  it('refuse localhost, 127.0.0.1 et [::1]', () => {
    for (const valeur of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      process.env.APP_URL = valeur;
      expect(() => verifierUrlsPubliques(), valeur).toThrow(/APP_URL/);
    }
  });

  it('nomme toutes les variables fautives, pas seulement la première', () => {
    process.env.APP_URL = 'http://localhost:3000';
    delete process.env.API_URL;

    expect(() => verifierUrlsPubliques()).toThrow(/APP_URL.*API_URL/);
  });

  /*
   * Un domaine qui contient « localhost » sans être localhost — l'ancre `^` et
   * le séparateur qui suit l'hôte doivent l'épargner.
   */
  it('ne confond pas un domaine qui commence par localhost', () => {
    process.env.APP_URL = 'https://localhost-events.online';

    expect(() => verifierUrlsPubliques()).not.toThrow();
  });
});
