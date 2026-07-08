'use client';

/**
 * lib/api.ts — Client API fetch avec gestion des cookies httpOnly.
 *
 * Wrapper minimal autour de fetch qui :
 *  - ajoute credentials: 'include' (cookies access_token / refresh_token)
 *  - parse le format de réponse standardisé { success, data, error } (CDC §6.12)
 *  - lève une exception en cas d'erreur métier (avec le code pour le UI)
 *
 * Conçu pour être utilisé avec React Query (useQuery / useMutation).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends RequestInit {
  // Les query params sont fusionnés dans l'URL
  params?: Record<string, string | number | boolean | undefined>;
}

/** Exécute une requête vers le backend NestJS et parse la réponse standardisée. */
export async function api<T = unknown>(
  path: string,
  { params, headers, ...init }: ApiOptions = {},
): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include', // cookies httpOnly (auth)
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.success) {
    const err = body?.error ?? { code: 'NETWORK_ERROR', message: response.statusText };
    throw new ApiError(err.code, err.message ?? 'Erreur', response.status, err.details);
  }

  return body.data as T;
}

/** Helper POST avec body JSON typé. */
export function apiPost<T = unknown>(
  path: string,
  data: unknown,
  init?: ApiOptions,
): Promise<T> {
  return api<T>(path, { ...init, method: 'POST', body: JSON.stringify(data) });
}

/** Helper PATCH avec body JSON typé. */
export function apiPatch<T = unknown>(
  path: string,
  data: unknown,
  init?: ApiOptions,
): Promise<T> {
  return api<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(data) });
}

export { API_URL };
