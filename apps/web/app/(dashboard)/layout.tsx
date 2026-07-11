import { DashboardSidebar } from '@/components/dashboard/sidebar';

/**
 * Layout partagé des dashboards (CDC §14.1 — routes protégées).
 * La sidebar est adaptative selon le rôle, déduit du pathname (segments
 * statiques /admin, /manager, /client). Le middleware Next.js redirige
 * les non-authentifiés (UX-only — la vraie sécurité est dans NestJS Guards).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
