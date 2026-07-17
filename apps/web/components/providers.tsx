'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/components/theme-provider';
import { ColorThemeProvider } from '@/components/color-theme-provider';

/**
 * Providers — Regroupe tous les providers transverses de l'app :
 *  - ThemeProvider (next-themes : dark/light/system + hotkey 'd')
 *  - ColorThemeProvider (thème de couleur Manager/Admin, indépendant du clair/sombre)
 *  - QueryClientProvider (React Query : cache, retries, invalidation)
 *  - Toaster (react-hot-toast : notifications ponctuelles, ex. erreurs d'achat)
 *
 * Utilisé dans app/layout.tsx pour englober toute l'arborescence.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Les données d'événement/tickets changent peu → staleTime généreux
            staleTime: 60 * 1000, // 1 min
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <ColorThemeProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster position="top-center" />
        </QueryClientProvider>
      </ColorThemeProvider>
    </ThemeProvider>
  );
}
