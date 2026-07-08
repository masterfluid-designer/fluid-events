import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiSuccess } from '@saas-events/types';

/**
 * ResponseInterceptor — Enveloppe les réponses réussies dans le format
 * standardisé { success: true, data, meta? } (CDC §6.12).
 *
 * Les réponses déjà au format ApiSuccess (success: true/false) ne sont pas
 * ré-enveloppées pour éviter l'imbrication.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // Ne pas ré-envelopper une réponse déjà standardisée
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        const body: ApiSuccess<T> = { success: true, data };
        return body;
      }),
    );
  }
}
