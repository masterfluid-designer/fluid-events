'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PlatformSettings {
  logoSvg: string | null;
  iconSvg: string | null;
}

/**
 * useplatformSettings — Logo/icône SVG de la plateforme (page Branding
 * Admin, 2026-07-17). GET public (@Public() côté API) : utilisé aussi bien
 * sur les pages marketing/connexion (non authentifiées) que dans les
 * dashboards. Repli sur { logoSvg: null, iconSvg: null } tant que rien n'a
 * été configuré — chaque composant appelant gère alors son propre repli
 * visuel (texte "Fluid Events", glyphe, etc.).
 */
export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => api<PlatformSettings>('/api/platform-settings'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
