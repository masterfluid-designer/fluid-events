'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import {
  addEventLogoToTrusted,
  listTrustedLogoCandidates,
  listTrustedLogos,
  removeTrustedLogo,
  uploadTrustedLogo,
} from '@/lib/trusted-logos';

/**
 * Admin — Confiance ("Ils nous font confiance" sur la landing, 2026-07-22 ;
 * simplifié le 2026-07-23).
 *
 * Décision produit : seuls les LOGOS sont pilotables depuis l'admin (dossier
 * S3 `trusted-logos/`, pas de liste JSON en base) — le titre/eyebrow de la
 * section est édité à la main (lib/content/landing/trusted.ts), comme le
 * reste de la landing. Toute la logique d'appel API vit dans
 * lib/trusted-logos.ts, partagée avec la lecture publique côté serveur.
 */
export default function AdminTrustedLogosPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Confiance</h1>
        <p className="text-sm text-muted-foreground">
          Logos affichés en défilement continu dans la section « Ils nous font confiance » de la
          page d&apos;accueil.
        </p>
      </div>

      <LogosCard />
      <EventCandidatesCard />
    </div>
  );
}

function LogosCard() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['trusted-logos'],
    queryFn: listTrustedLogos,
  });

  const remove = useMutation({
    mutationFn: removeTrustedLogo,
    onSuccess: () => {
      toast.success('Logo retiré');
      queryClient.invalidateQueries({ queryKey: ['trusted-logos'] });
      queryClient.invalidateQueries({ queryKey: ['trusted-logo-candidates'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Impossible de retirer ce logo'),
  });

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      await uploadTrustedLogo(file);
      toast.success('Logo ajouté');
      queryClient.invalidateQueries({ queryKey: ['trusted-logos'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Impossible de téléverser le logo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logos ({items.length})</CardTitle>
        <CardDescription>PNG, JPEG ou WEBP — 5 Mo maximum par fichier.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner className="size-6" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun logo pour le moment.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {items.map((item) => (
              <div
                key={item.key}
                className="group relative flex aspect-square items-center justify-center rounded-lg border border-stroke bg-white p-3 dark:border-strokedark"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="max-h-full w-auto max-w-full object-contain" />
                <button
                  type="button"
                  aria-label="Retirer ce logo"
                  onClick={() => remove.mutate(item.key)}
                  disabled={remove.isPending}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded bg-black/60 text-white opacity-100 transition-opacity hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> {uploading ? 'Téléversement...' : 'Téléverser un logo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EventCandidatesCard() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['trusted-logo-candidates'],
    queryFn: listTrustedLogoCandidates,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['trusted-logo-candidates'] });
    queryClient.invalidateQueries({ queryKey: ['trusted-logos'] });
  }

  const add = useMutation({
    mutationFn: addEventLogoToTrusted,
    onSuccess: () => {
      toast.success('Logo ajouté depuis cet événement');
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Impossible d'ajouter ce logo"),
  });

  const remove = useMutation({
    mutationFn: removeTrustedLogo,
    onSuccess: () => {
      toast.success('Logo retiré');
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Impossible de retirer ce logo'),
  });

  const candidates = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ajouter depuis un événement</CardTitle>
        <CardDescription>
          Reprend le logo d&apos;un événement existant dans la section confiance de la landing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner className="size-6" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun événement avec un logo pour le moment.</p>
        ) : (
          <ul className="divide-y divide-border">
            {candidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-stroke bg-white p-1.5 dark:border-strokedark">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logoUrl} alt="" className="max-h-full w-auto max-w-full object-contain" />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={c.title}>
                  {c.title}
                </span>
                {c.addedKey ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-muted-foreground"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(c.addedKey!)}
                  >
                    <Trash2 className="size-3.5" /> Retirer
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0"
                    disabled={add.isPending}
                    onClick={() => add.mutate(c.id)}
                  >
                    <Plus className="size-3.5" /> Ajouter
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
