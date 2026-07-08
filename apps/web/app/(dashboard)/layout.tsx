import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { Role } from '@saas-events/types';

/**
 * Layout partagé des dashboards (CDC §14.1 — routes protégées).
 * La sidebar est adaptative selon le rôle. Le middleware Next.js redirige
 * les non-authentifiés (UX-only — la vraie sécurité est dans NestJS Guards).
 *
 * ⚠️ En production, le rôle réel provient du JWT décodé côté client.
 * Ici on accepte un rôle via segment d'URL pour la démo statique.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ role?: string }>;
}) {
  const { role: roleSegment } = await params;
  const role = normalizeRole(roleSegment);

  return (
    <div className="flex min-h-svh bg-background">
      <DashboardSidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function normalizeRole(segment?: string): Role {
  switch (segment) {
    case 'admin':
      return Role.SUPER_ADMIN;
    case 'manager':
      return Role.MANAGER;
    case 'client':
      return Role.CLIENT;
    default:
      return Role.CLIENT;
  }
}
