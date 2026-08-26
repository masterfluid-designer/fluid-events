/**
 * Tests — le callback Google ne doit pas tuer le serveur (2026-08-26).
 *
 * Cette route a passé des jours à faire redémarrer l'API en production, sans
 * que rien ne le laisse voir : le navigateur recevait bien sa redirection, la
 * connexion « marchait », et le processus mourait juste après.
 *
 * `@Res({ passthrough: true })` demande à Nest de reprendre la main après le
 * handler et d'écrire lui aussi dans la réponse. Comme `res.redirect()` l'a
 * déjà envoyée, `res.json()` levait `ERR_HTTP_HEADERS_SENT` ; le filtre
 * d'exception essayait alors de répondre à son tour, levait la même erreur —
 * hors de toute portée de capture cette fois — et le processus s'arrêtait.
 *
 * Conséquence invisible et coûteuse : chaque acheteur qui se connectait tuait
 * l'API, le tunnel d'achat mourait avec elle, et AUCUNE commande n'a jamais pu
 * aboutir en production.
 */
import { describe, it, expect } from 'vitest';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ROUTE_ARGS_METADATA, RESPONSE_PASSTHROUGH_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';

/** Les arguments décorés d'une méthode, tels que Nest les a enregistrés. */
function argumentsDeRoute(methode: string): Record<string, { index: number }> {
  return Reflect.getMetadata(ROUTE_ARGS_METADATA, AuthController, methode) ?? {};
}

/** La méthode reçoit-elle un `@Res()` ? */
function recoitLaReponse(methode: string): boolean {
  return Object.keys(argumentsDeRoute(methode)).some((cle) =>
    cle.startsWith(`${RouteParamtypes.RESPONSE}:`),
  );
}

/*
 * Nest ne range PAS le passthrough dans les options de l'argument : il pose
 * un drapeau à part, sur le CONSTRUCTEUR de la classe et indexé par le nom de
 * la méthode (`Reflect.defineMetadata(..., target.constructor, key)`).
 *
 * Le chercher ailleurs — dans `data`, ou sur la méthode du prototype — rend
 * toujours `undefined`, et un test écrit ainsi passerait au vert quoi qu’on
 * fasse. Les deux premières écritures de ce test sont tombées dans ce piège.
 */
function laisseNestRepondre(methode: string): boolean {
  return Reflect.getMetadata(RESPONSE_PASSTHROUGH_METADATA, AuthController, methode) === true;
}

describe('AuthController — le callback Google rend la main à Nest ou pas', () => {
  it('déclare @Res() SANS passthrough sur la route qui redirige', () => {
    expect(recoitLaReponse('googleCallback')).toBe(true);
    expect(laisseNestRepondre('googleCallback')).toBe(false);
  });

  /*
   * Le pendant : les routes qui RENVOIENT du JSON ont besoin, elles, du
   * passthrough — sans lui Nest ne renvoie jamais leur valeur de retour et la
   * requête reste pendue. Ce test empêche de « corriger » l'une en cassant les
   * autres.
   */
  it('garde le passthrough sur les routes qui renvoient un corps', () => {
    for (const methode of ['login', 'loginScanner', 'refresh', 'stopImpersonation', 'logout']) {
      if (!recoitLaReponse(methode)) continue;
      expect(laisseNestRepondre(methode), `${methode} doit garder passthrough`).toBe(true);
    }
  });

  /*
   * Un handler qui écrit lui-même la réponse ne doit RIEN renvoyer : une
   * valeur de retour non nulle relancerait Nest sur une réponse déjà partie,
   * même sans passthrough.
   */
  it('ne promet aucune valeur de retour', () => {
    expect(AuthController.prototype.googleCallback.length).toBeGreaterThan(0);
    const source = AuthController.prototype.googleCallback.toString();
    expect(source).toContain('redirect');
    // Aucun `return` porteur de valeur dans le corps du handler.
    expect(/return\s+[^;\s]/.test(source)).toBe(false);
  });
});
