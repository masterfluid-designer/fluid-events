'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Ticket, Users, Settings, BarChart3, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Role } from '@saas-events/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navByRole: Record<Role, NavItem[]> = {
  [Role.SUPER_ADMIN]: [
    { href: '/admin', label: 'Vue d\'ensemble', icon: <LayoutDashboard className="size-4" /> },
    { href: '/admin/events', label: 'Événements', icon: <Ticket className="size-4" /> },
    { href: '/admin/managers', label: 'Managers', icon: <Users className="size-4" /> },
    { href: '/admin/logs', label: 'Logs', icon: <BarChart3 className="size-4" /> },
    { href: '/admin/providers', label: 'Paiements', icon: <Settings className="size-4" /> },
  ],
  [Role.MANAGER]: [
    { href: '/manager', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
    { href: '/manager/builder', label: 'Page builder', icon: <Settings className="size-4" /> },
    { href: '/manager/tickets', label: 'Billets', icon: <Ticket className="size-4" /> },
    { href: '/manager/participants', label: 'Participants', icon: <Users className="size-4" /> },
    { href: '/manager/analytics', label: 'Statistiques', icon: <BarChart3 className="size-4" /> },
  ],
  [Role.SCANNER]: [
    { href: '/scanner/scan', label: 'Scanner', icon: <Ticket className="size-4" /> },
  ],
  [Role.CLIENT]: [
    { href: '/client', label: 'Mes billets', icon: <Ticket className="size-4" /> },
    { href: '/client/orders', label: 'Mes commandes', icon: <LayoutDashboard className="size-4" /> },
    { href: '/client/profile', label: 'Profil', icon: <Users className="size-4" /> },
  ],
};

export function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navByRole[role] ?? navByRole[Role.CLIENT];

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/30 md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-primary">Fluid Events</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" asChild>
          <Link href="/auth/login">
            <LogOut className="size-4" /> Déconnexion
          </Link>
        </Button>
      </div>
    </aside>
  );
}
