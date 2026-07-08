import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiError, ErrorCodes } from '@saas-events/types';

/**
 * Mappe un statut HTTP vers un code d'erreur métier standardisé (CDC §15.4).
 * Préserve les codes métier explicites fournis par les services (ex: STOCK_RACE_CONDITION).
 */
const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCodes.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Convertit une exception en réponse d'erreur standardisée (CDC §6.12).
 * Pure function — testable isolément.
 */
export function httpExceptionToApiError(exception: unknown): ApiError {
  // 1. HttpException NestJS (forme structurée ou message simple)
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        success: false,
        error: {
          code: STATUS_TO_CODE[status] ?? 'ERROR',
          message: response,
        },
      };
    }

    const respObj = response as Record<string, any>;
    return {
      success: false,
      error: {
        code: respObj.code ?? STATUS_TO_CODE[status] ?? 'ERROR',
        message: respObj.message ?? exception.message ?? 'Erreur',
        ...(respObj.details ? { details: respObj.details } : {}),
      },
    };
  }

  // 2. Erreur inattendue (BDD, réseau, bug) — ne JAMAIS fuiter le détail en prod.
  //    Le message brut peut contenir des infos sensibles (mot de passe, stack).
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erreur interne du serveur',
    },
  };
}

/**
 * HttpExceptionFilter — Capture TOUTES les exceptions et renvoie le format
 * standardisé { success: false, error: { code, message, details? } }.
 *
 * Les erreurs inattendues sont loggées côté serveur (avec le détail réel pour
 * le debug) mais le client ne reçoit qu'un message générique (anti-fuite).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log détaillé côté serveur pour le debug
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body = httpExceptionToApiError(exception);
    response.status(status).json(body);
  }
}
