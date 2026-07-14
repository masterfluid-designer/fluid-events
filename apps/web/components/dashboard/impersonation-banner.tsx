'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, apiPost, ApiError } from '@/lib/api';

interface Me {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  isImpersonating: boolean;
}

/**
 * Bannière affichée quand un Admin est connecté au dashboard d'un Manager
 * via impersonation (CDC §14.3). `GET /api/auth/me` échoue silencieusement
 * (401) sur toute page non authentifiée — `retry: false` évite un spam de
 * requêtes, et la bannière se contente de ne rien afficher dans ce cas.
 */
export function ImpersonationBanner() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<Me>('/api/auth/me'),
    retry: false,
  });

  if (!data?.isImpersonating) return null;

  const stopImpersonation = async () => {
    try {
      await apiPost('/api/auth/stop-impersonation', {});
      queryClient.clear();
      window.location.href = '/admin/managers';
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Impossible de revenir à la session administrateur",
      );
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/15 px-4.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
      <span className="flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0" />
        Connecté en tant que <strong>{data.name ?? data.email}</strong> — session Admin en pause
      </span>
      <Button variant="outline" size="sm" onClick={stopImpersonation}>
        Retour à l&apos;administration
      </Button>
    </div>
  );
}
