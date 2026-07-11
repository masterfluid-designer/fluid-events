import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Gestion des billets (CDC §6.3 tickets + §13 design personnalisé).
 * Données mockées — pas encore d'API `tickets` branchée (module stub, cf. audit v4).
 */

interface TicketTypeRow {
  name: string;
  description: string;
  price: string;
  sold: number;
  stock: number;
  status: 'active' | 'soldout';
}

const ticketTypes: TicketTypeRow[] = [
  { name: 'VIP Or', description: 'Accès backstage · open bar', price: '15 000 XOF', sold: 412, stock: 468, status: 'active' },
  { name: 'Standard', description: 'Accès général', price: '6 000 XOF', sold: 689, stock: 1320, status: 'active' },
  { name: 'Early Bird', description: 'Tarif de lancement', price: '4 000 XOF', sold: 139, stock: 139, status: 'soldout' },
];

export default function ManagerTicketsPage() {
  const totalSold = ticketTypes.reduce((sum, t) => sum + t.sold, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Types de billets</h1>
          <p className="text-sm text-muted-foreground">
            {ticketTypes.length} types actifs · {totalSold.toLocaleString('fr-FR')} vendus
          </p>
        </div>
        <Button>+ Ajouter un billet</Button>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="grid grid-cols-[1.6fr_0.9fr_1.3fr_0.8fr_0.6fr] gap-4 border-b border-border bg-secondary px-4.5 py-3 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
          <span>Billet</span>
          <span>Prix</span>
          <span>Stock</span>
          <span>Statut</span>
          <span />
        </div>
        {ticketTypes.map((t, i) => {
          const percent = Math.round((t.sold / t.stock) * 100);
          return (
            <div
              key={t.name}
              className={`grid grid-cols-[1.6fr_0.9fr_1.3fr_0.8fr_0.6fr] items-center gap-4 px-4.5 py-3.5 ${
                i < ticketTypes.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              <div>
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </div>
              <div className="text-sm font-semibold">{t.price}</div>
              <div>
                <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${t.status === 'soldout' ? 'bg-muted-foreground' : 'bg-primary'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.sold} / {t.stock} vendus
                </div>
              </div>
              <Badge variant={t.status === 'active' ? 'success' : 'secondary'} className="w-fit">
                {t.status === 'active' ? 'Actif' : 'Épuisé'}
              </Badge>
              <button type="button" aria-label="Options" className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="size-4" />
              </button>
            </div>
          );
        })}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-sm font-bold">Design du billet — VIP Or</h2>
            <div>
              <label className="mb-1.5 block text-xs font-semibold">Image du billet</label>
              <div className="flex h-17.5 items-center justify-center rounded-lg border border-dashed border-input text-xs text-muted-foreground">
                Déposer un logo / visuel (max 5 Mo)
              </div>
            </div>
            <div className="flex gap-3.5">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-semibold">Couleur de fond</label>
                <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
                  <span className="size-4 rounded shrink-0" style={{ background: '#D4AC0D' }} />
                  <span className="font-mono text-xs">#D4AC0D</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-semibold">Couleur du texte</label>
                <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
                  <span className="size-4 rounded shrink-0" style={{ background: '#333333' }} />
                  <span className="font-mono text-xs">#333333</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3.5 text-sm font-bold">Aperçu</h2>
            <div
              className="overflow-hidden rounded-2xl p-5.5"
              style={{ background: '#D4AC0D', color: '#333333' }}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] opacity-70">
                Concert FESTA 2026
              </div>
              <div className="mt-1.5 text-xl font-extrabold">VIP Or</div>
              <div className="mt-1 text-xs opacity-85">31 déc 2026 · Palais des Sports</div>
              <div className="mt-4.5 flex items-center justify-between">
                <div className="font-mono text-xs">ORD-3F8A1B</div>
                <div
                  className="size-13 rounded-md bg-white"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg,#333 0 3px, transparent 3px 6px), repeating-linear-gradient(135deg,#333 0 3px, transparent 3px 6px)',
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
