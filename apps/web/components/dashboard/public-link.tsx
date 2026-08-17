'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Copy, ExternalLink } from 'lucide-react';

/**
 * PublicLink — Adresse publique de l'événement, copiable et ouvrable.
 *
 * L'URL se construit depuis `window.location.origin` plutôt que depuis une
 * variable d'environnement : le Manager la partage telle qu'il la voit, et
 * elle reste juste en local comme en production sans configuration à tenir
 * à jour.
 *
 * `variant="bar"` pour le tableau de bord (l'URL est lisible en entier),
 * `variant="compact"` pour la barre d'outils du Builder, déjà chargée.
 */
export function PublicLink({
  slug,
  variant = 'bar',
}: {
  slug: string;
  variant?: 'bar' | 'compact';
}) {
  const [copied, setCopied] = useState(false);
  const path = `/e/${slug}`;
  // Rendu serveur : `window` n'existe pas encore, on affiche le chemin seul
  // — jamais un `undefined/e/slug` le temps de l'hydratation.
  const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Lien copié');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard exige HTTPS ou localhost, et l'autorisation du navigateur.
      // En cas de refus on ne laisse pas le Manager sans recours.
      toast.error('Copie impossible — sélectionnez le lien pour le copier à la main.');
    }
  }

  if (variant === 'compact') {
    return (
      <div className="flex overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          onClick={copy}
          aria-label="Copier le lien public de l'événement"
          title={url}
          className="flex items-center gap-1.5 p-1.5 px-2.5 text-xs font-medium"
        >
          {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
          Lien public
        </button>
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouvrir la page publique dans un nouvel onglet"
          className="border-l border-border p-1.5 px-2.5"
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">Page publique</span>
      {/* `select-all` : un clic sélectionne l'URL entière, utile quand la
          copie par le presse-papiers est refusée par le navigateur. */}
      <code className="min-w-0 flex-1 select-all truncate text-xs">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
      >
        {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
        {copied ? 'Copié' : 'Copier'}
      </button>
      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
      >
        <ExternalLink className="size-3.5" /> Ouvrir
      </a>
    </div>
  );
}
