'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

/**
 * Page Admin — historique complet des logs d'audit (décision produit
 * 2026-07-14). `getOverview()` (Vue d'ensemble) n'affiche que les 10 plus
 * récents — cette page est la vue paginée/filtrable dédiée.
 */

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface LogsResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

export default function AdminLogsPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-logs', page, appliedFilter],
    queryFn: () =>
      api<LogsResponse>('/api/admin/logs', {
        params: { page, pageSize: PAGE_SIZE, ...(appliedFilter ? { action: appliedFilter } : {}) },
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs système</h1>
        <p className="text-sm text-muted-foreground">Historique complet des événements d&apos;audit de la plateforme.</p>
      </div>

      <Card className="p-4.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setAppliedFilter(actionFilter.trim());
          }}
          className="flex flex-wrap items-end gap-2.5"
        >
          <div className="flex-1 space-y-1.5" style={{ minWidth: '220px' }}>
            <label className="text-xs font-medium text-muted-foreground">Filtrer par action</label>
            <Input
              placeholder="ex : auth.google.login"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Filtrer
          </Button>
          {appliedFilter && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setActionFilter('');
                setAppliedFilter('');
                setPage(1);
              }}
            >
              Réinitialiser
            </Button>
          )}
        </form>
      </Card>

      <Card className="overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4.5 py-3.5">
          <span className="text-sm font-bold">{data ? `${data.total} entrée${data.total > 1 ? 's' : ''}` : 'Logs'}</span>
          {data && data.total > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Précédent
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Suivant
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        ) : isError || !data ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Impossible de charger les logs.</div>
        ) : data.logs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Aucun log trouvé.</div>
        ) : (
          data.logs.map((log, i) => (
            <div
              key={log.id}
              className={
                'flex flex-wrap items-center justify-between gap-2 px-4.5 py-2.5 text-sm' +
                (i < data.logs.length - 1 ? ' border-b border-border' : '')
              }
            >
              <div className="min-w-0">
                <code className="font-mono text-xs text-accent-terracotta dark:text-accent-terracotta-dark">
                  {log.action}
                </code>
                {(log.userName || log.userEmail) && (
                  <div className="truncate text-xs text-muted-foreground">
                    {log.userName ?? log.userEmail}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {dateFmt.format(new Date(log.createdAt))}
              </span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
