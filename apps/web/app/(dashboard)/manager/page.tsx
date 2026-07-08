import {
  DollarSign,
  Ticket,
  TrendingUp,
  ScanLine,
  Users,
  Clock,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Dashboard Manager (CDC §14.3 — KPIs événement géré).
 * En V1, 1 Manager = 1 Événement (CDC §1.4). Données via GET /api/events/:id/stats.
 */
export default function ManagerDashboardPage() {
  const stats = [
    { label: 'Revenus', value: '4.2M XOF', icon: <DollarSign className="size-4" />, trend: '+12%' },
    { label: 'Billets vendus', value: '1 240', icon: <Ticket className="size-4" />, trend: '+87' },
    { label: 'Taux de conversion', value: '64%', icon: <TrendingUp className="size-4" />, trend: '+4pts' },
    { label: 'Taux de scan', value: '78%', icon: <ScanLine className="size-4" />, trend: '968/1240' },
  ];

  const revenueByType = [
    { name: 'VIP Or', revenue: '2.8M', count: 412, percent: 67 },
    { name: 'Standard', revenue: '1.1M', count: 689, percent: 26 },
    { name: 'Early Bird', revenue: '0.3M', count: 139, percent: 7 },
  ];

  const scannerActivity = [
    { name: 'Entrée Nord', scans: 487, last: 'il y a 2 min' },
    { name: 'Entrée Sud', scans: 312, last: 'il y a 5 min' },
    { name: 'VIP Gate', scans: 169, last: 'il y a 14 min' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concert FESTA 2026</h1>
          <p className="text-sm text-muted-foreground">
            Tableau de bord de votre événement
          </p>
        </div>
        <Badge variant="success">● Publié</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <span className="text-primary">{s.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{s.value}</div>
              <div className="mt-1 text-xs text-emerald-600">{s.trend}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenus par type de billet</CardTitle>
            <CardDescription>Répartition des ventes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {revenueByType.map((row) => (
              <div key={row.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">
                    {row.count} billets • {row.revenue} XOF
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" /> Activité scanners
            </CardTitle>
            <CardDescription>Scans par point d&apos;accès</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scannerActivity.map((sc) => (
              <div
                key={sc.name}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <div className="font-medium">{sc.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {sc.last}
                  </div>
                </div>
                <Badge variant="secondary">{sc.scans} scans</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
