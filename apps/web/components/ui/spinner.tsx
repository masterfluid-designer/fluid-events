import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Spinner — Indicateur de chargement.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('size-4 animate-spin text-muted-foreground', className)}
      aria-hidden="true"
    />
  );
}
