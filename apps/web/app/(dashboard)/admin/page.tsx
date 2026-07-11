import { Ticket, Users, DollarSign, TrendingUp, Activity } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Dashboard Super Admin (CDC §14.2 — KPIs plateforme).
 * Données mockées pour la démo ; en prod via GET /api/admin/overview.
 */
export default function AdminOverviewPage() {
  const kpis = [
    { label: 'Événements actifs', value: '24', icon: <Ticket className="size-4" />, trend: '+3' },
    { label: 'Revenus (30j)', value: '12.4M XOF', icon: <DollarSign className="size-4" />, trend: '+18%' },
    { label: 'Billets vendus', value: '3 847', icon: <TrendingUp className="size-4" />, trend: '+241' },
    { label: 'Managers', value: '18', icon: <Users className="size-4" />, trend: '+2' },
  ];

  const managers = [
    { name: 'Kwame Asante', event: 'Concert FESTA 2026', status: 'active' },
    { name: 'Nadia Traoré', event: 'Conférence Tech Africa', status: 'active' },
    { name: 'Ibrahim Sow', event: 'Soirée Gala Abidjan', status: 'suspended' },
  ];

  const providers = [
    { name: 'Kkiapay', status: 'default' },
    { name: 'CinetPay', status: 'active' },
    { name: 'FedaPay', status: 'inactive' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble plateforme</h1>
        <p className="text-sm text-muted-foreground">
          Indicateurs clés de la plateforme
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{kpi.label}</span>
                <span className="text-accent-terracotta dark:text-accent-terracotta-dark">{kpi.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{kpi.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{kpi.trend} ce mois</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden py-0">
          <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
            <span className="text-sm font-bold">Managers</span>
            <Button size="sm">+ Inviter</Button>
          </div>
          {managers.map((m, i) => (
            <div
              key={m.name}
              className={`flex items-center justify-between px-4.5 py-3 text-sm ${
                i < managers.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.event}</div>
              </div>
              <Badge variant={m.status === 'active' ? 'success' : 'secondary'}>
                {m.status === 'active' ? 'Actif' : 'Suspendu'}
              </Badge>
            </div>
          ))}
        </Card>

        <Card>
          <CardContent className="space-y-2.5 p-4.5">
            <div className="mb-1.5 text-sm font-bold">Fournisseurs de paiement</div>
            {providers.map((p) => (
              <div
                key={p.name}
                className={`flex items-center justify-between rounded-lg border border-border px-3 py-2.5 ${
                  p.status === 'inactive' ? 'opacity-55' : ''
                }`}
              >
                <span className="text-sm font-semibold">{p.name}</span>
                <Badge variant={p.status === 'default' ? 'success' : 'secondary'}>
                  {p.status === 'default' ? 'Par défaut' : p.status === 'active' ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> Logs système
          </CardTitle>
          <CardDescription>Derniers événements système</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            { action: 'payment.webhook.success', time: 'il y a 2 min' },
            { action: 'scan.valid', time: 'il y a 8 min' },
            { action: 'event.created', time: 'il y a 24 min' },
          ].map((log, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <code className="text-accent-terracotta dark:text-accent-terracotta-dark font-mono text-xs">{log.action}</code>
              <span className="text-xs text-muted-foreground">{log.time}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
