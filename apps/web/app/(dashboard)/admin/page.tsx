import { Ticket, Users, DollarSign, TrendingUp, Activity } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

  const topEvents = [
    { name: 'Concert FESTA 2026', revenue: '4.2M', tickets: 1240, status: 'PUBLISHED' },
    { name: 'Conférence Tech Africa', revenue: '2.8M', tickets: 612, status: 'PUBLISHED' },
    { name: 'Soirée Gala Abidjan', revenue: '1.9M', tickets: 380, status: 'PUBLISHED' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble</h1>
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
                <span className="text-primary">{kpi.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{kpi.value}</div>
              <div className="mt-1 text-xs text-emerald-600">{kpi.trend} ce mois</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top événements</CardTitle>
            <CardDescription>Par revenu généré</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topEvents.map((event) => (
              <div
                key={event.name}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <div className="font-medium">{event.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {event.tickets} billets • {event.revenue} XOF
                  </div>
                </div>
                <Badge variant="success">● Actif</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Activité récente
            </CardTitle>
            <CardDescription>10 derniers événements système</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { action: 'payment.webhook.success', entity: 'Order #3f8a', time: 'il y a 2 min' },
              { action: 'scan.valid', entity: 'OrderItem #a21', time: 'il y a 8 min' },
              { action: 'event.created', entity: 'Soirée Gala', time: 'il y a 24 min' },
              { action: 'whatsapp.sent', entity: 'Order #3f8a', time: 'il y a 2 min' },
            ].map((log, i) => (
              <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <code className="text-xs font-mono text-primary">{log.action}</code>
                  <div className="text-xs text-muted-foreground">{log.entity}</div>
                </div>
                <span className="text-xs text-muted-foreground">{log.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
