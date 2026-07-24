import type { TrustedLogo } from "@/lib/trusted-logos";

export type { TrustedLogo };

/**
 * Logos "Ils nous font confiance" — dossier S3 `trusted-logos/` (décision
 * produit 2026-07-22, voir StorageController). Fetch côté serveur, jamais
 * côté client : évite un flash de section vide le temps du round-trip.
 * Type partagé avec lib/trusted-logos.ts (client, page admin).
 */
export async function getTrustedLogos(): Promise<TrustedLogo[]> {
  const apiBase =
    process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiBase}/api/storage/media-folders/trusted-logos`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const body = await res.json();
    return body?.data?.items ?? [];
  } catch {
    return [];
  }
}
