'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Upload, RotateCcw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { apiPut, ApiError } from '@/lib/api';
import { usePlatformSettings } from '@/lib/use-platform-settings';

/**
 * Admin — Branding. Logo + icône SVG de la plateforme (page dédiée,
 * 2026-07-17) — réglage plateforme (Super Admin uniquement, contrairement à
 * la page Apparence qui est une préférence personnelle Manager/Admin).
 * Remplace le texte "Fluid Events" partout où un logo devrait apparaître
 * (sidebar, en-tête public, connexion) et l'icône (repli compact de la
 * sidebar, favicon) — voir components/brand/brand-logo.tsx.
 */

type PendingValue = string | null | undefined; // undefined = inchangé, null = réinitialiser, string = nouveau SVG

export default function AdminBrandingPage() {
  const queryClient = useQueryClient();
  const { data: current, isLoading } = usePlatformSettings();

  const [logoSvg, setLogoSvg] = useState<PendingValue>(undefined);
  const [iconSvg, setIconSvg] = useState<PendingValue>(undefined);

  const save = useMutation({
    mutationFn: () => apiPut('/api/admin/platform-settings', { logoSvg, iconSvg }),
    onSuccess: () => {
      toast.success('Branding mis à jour');
      setLogoSvg(undefined);
      setIconSvg(undefined);
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible d\'enregistrer le branding');
    },
  });

  const logoPreview = logoSvg !== undefined ? logoSvg : current?.logoSvg ?? null;
  const iconPreview = iconSvg !== undefined ? iconSvg : current?.iconSvg ?? null;
  const hasChanges = logoSvg !== undefined || iconSvg !== undefined;

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Branding</h1>
        <p className="text-sm text-muted-foreground">
          Logo et icône SVG de la plateforme — remplacent le texte "Fluid Events" partout où un
          logo devrait apparaître (sidebar, en-tête public, page de connexion, favicon). Rendus en
          blanc automatiquement en mode sombre, quelle que soit leur couleur d'origine.
        </p>
      </div>

      <SvgUploadCard
        title="Logo"
        description="Version complète — utilisée dans la sidebar (étendue) et l'en-tête du site public."
        value={logoPreview}
        onChange={setLogoSvg}
      />

      <SvgUploadCard
        title="Icône"
        description="Version compacte carrée — utilisée quand la sidebar est réduite et comme favicon."
        value={iconPreview}
        onChange={setIconSvg}
      />

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={!hasChanges || save.isPending}>
          {save.isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}

function SvgUploadCard({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: string | null;
  onChange: (value: PendingValue) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
      toast.error('Seuls les fichiers .svg sont acceptés');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      if (!/^\s*(<\?xml|<svg)/i.test(text)) {
        toast.error('Ce fichier ne ressemble pas à un SVG valide');
        return;
      }
      setFileName(file.name);
      onChange(text);
    };
    reader.readAsText(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex h-24 items-center justify-center rounded-lg border border-stroke bg-white p-3 dark:border-strokedark">
            {value ? (
              <span
                className="[&_svg]:h-full [&_svg]:w-auto"
                style={{ maxHeight: '100%' }}
                dangerouslySetInnerHTML={{ __html: value }}
              />
            ) : (
              <span className="text-xs text-manatee">Aperçu clair — aucun fichier</span>
            )}
          </div>
          <div className="flex h-24 items-center justify-center rounded-lg border border-strokedark bg-black p-3">
            {value ? (
              // Filtre appliqué inconditionnellement (pas dark:) : ce bloc simule
              // toujours un fond sombre, indépendamment du thème clair/sombre
              // réellement actif sur la page en cours d'édition.
              <span
                className="[&_svg]:h-full [&_svg]:w-auto"
                style={{ maxHeight: '100%', filter: 'brightness(0) invert(1)' }}
                dangerouslySetInnerHTML={{ __html: value }}
              />
            ) : (
              <span className="text-xs text-manatee">Aperçu sombre — aucun fichier</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> Choisir un fichier .svg
          </Button>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setFileName(null);
                onChange(null);
              }}
            >
              <RotateCcw className="size-4" /> Réinitialiser
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
