/**
 * Tests unitaires — HttpExceptionFilter
 * Format de réponse d'erreur standardisé (CDC §6.12, §15.4).
 */
import { describe, it, expect } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { httpExceptionToApiError } from './http-exception-filter';

describe('httpExceptionToApiError()', () => {
  it('mappe une NotFoundException avec message', () => {
    const exc = new HttpException('Ticket introuvable', HttpStatus.NOT_FOUND);
    const result = httpExceptionToApiError(exc);
    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Ticket introuvable');
    expect(result.error.code).toBeDefined();
  });

  it('mappe une ForbiddenException → code FORBIDDEN', () => {
    const exc = new HttpException('Accès refusé', HttpStatus.FORBIDDEN);
    const result = httpExceptionToApiError(exc);
    expect(result.error.code).toBe('FORBIDDEN');
  });

  it('mappe une UnauthorizedException → UNAUTHORIZED', () => {
    const exc = new HttpException('Token invalide', HttpStatus.UNAUTHORIZED);
    const result = httpExceptionToApiError(exc);
    expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('mappe une ConflictException → code métier si fourni', () => {
    const exc = new HttpException(
      { code: 'STOCK_RACE_CONDITION', message: 'Stock épuisé' },
      HttpStatus.CONFLICT,
    );
    const result = httpExceptionToApiError(exc);
    expect(result.error.code).toBe('STOCK_RACE_CONDITION');
    expect(result.error.message).toBe('Stock épuisé');
  });

  it('mappe une erreur de validation (BadRequest) avec details', () => {
    const exc = new HttpException(
      { message: 'Validation échouée', details: { ticketId: 'requis' } },
      HttpStatus.BAD_REQUEST,
    );
    const result = httpExceptionToApiError(exc);
    expect(result.error.details).toEqual({ ticketId: 'requis' });
  });

  it('mappe une erreur non-HTTP → INTERNAL_ERROR', () => {
    const result = httpExceptionToApiError(new Error('boom'));
    expect(result.error.code).toBe('INTERNAL_ERROR');
    expect(result.error.message).toBe('Erreur interne du serveur');
  });

  it('ne fuite jamais le détail d\'une erreur inattendue en production', () => {
    const exc = new Error('sensitive db password leaked');
    const result = httpExceptionToApiError(exc);
    expect(JSON.stringify(result)).not.toContain('sensitive db password');
  });
});
