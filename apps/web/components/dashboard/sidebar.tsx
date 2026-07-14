'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Ticket, Users, Settings, BarChart3, LogOut, Menu, X } from 'lucide-react';
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

function roleFromPathname(pathname: string): Role {
  if (pathname.startsWith('/admin')) return Role.SUPER_ADMIN;
  if (pathname.startsWith('/manager')) return Role.MANAGER;
  if (pathname.startsWith('/scanner')) return Role.SCANNER;
  return Role.CLIENT;
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );
}

/**
 * DashboardSidebar — navigation adaptative selon le rôle (déduit du pathname).
 *
 * Desktop (≥ md) : sidebar fixe classique. Mobile (< md) : la sidebar fixe est
 * masquée (aucune alternative n'existait avant — navigation impossible sur
 * mobile, bug réel constaté en conditions réelles) — remplacée par une barre
 * fine + un tiroir coulissant (overlay + panneau), mêmes liens, fermé par
 * défaut, fermé automatiquement à la navigation ou au clic sur le fond.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const role = roleFromPathname(pathname);
  const items = navByRole[role] ?? navByRole[Role.CLIENT];
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-primary">Fluid Events</span>
        </Link>
        <Button variant="ghost" size="icon" aria-label="Ouvrir le menu" onClick={() => setMobileOpen(true)}>
          <Menu className="size-5" />
        </Button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-background shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-bold text-primary">Fluid Events</span>
              <Button variant="ghost" size="icon" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)}>
                <X className="size-5" />
              </Button>
            </div>
            <NavLinks items={items} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t p-3">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" asChild>
                <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                  <LogOut className="size-4" /> Déconnexion
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      )}

      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="text-primary">Fluid Events</span>
          </Link>
        </div>
        <NavLinks items={items} pathname={pathname} />
        <div className="border-t p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" asChild>
            <Link href="/auth/login">
              <LogOut className="size-4" /> Déconnexion
            </Link>
          </Button>
        </div>
      </aside>
    </>
  );
}
