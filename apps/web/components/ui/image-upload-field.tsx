'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiUpload, ApiError } from '@/lib/api';

/**
 * ImageUploadField — Upload vers POST /api/storage/upload (RULES.md §6).
 * Utilisé par le Builder (props.imageUrl) et le design des billets
 * (designImageUrl) : même bucket whitelisté, même contrat backend.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (url: string | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await apiUpload('/api/storage/upload', file);
      onChange(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Impossible de téléverser l'image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold">{label}</label>
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-17.5 w-full rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-black/80"
          >
            Retirer
          </button>
        </div>
      ) : (
        <label className="flex h-17.5 cursor-pointer items-center justify-center rounded-lg border border-dashed border-input text-xs text-muted-foreground hover:bg-accent">
          {uploading ? 'Téléversement...' : 'Déposer un fichier'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}
