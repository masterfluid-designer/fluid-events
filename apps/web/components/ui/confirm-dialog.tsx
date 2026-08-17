'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * ConfirmDialog — Validation explicite avant une action destructive.
 *
 * Volontairement modal et non un simple `confirm()` : il faut pouvoir écrire
 * ce qui va être détruit, avec le compte exact, et nommer le bouton d'après
 * l'action plutôt qu'un « OK » qui n'engage à rien.
 *
 * Fermable par Échap et par le fond, contrairement aux gardes bloquants du
 * dashboard : renoncer à une suppression doit être plus facile que la faire.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        // Stoppe la propagation : un clic DANS la boîte ne doit pas la fermer.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-solid-2"
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4.5" />
          </span>
          <h2 className="pt-1.5 font-serif text-lg leading-none">{title}</h2>
        </div>

        <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? 'En cours...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
