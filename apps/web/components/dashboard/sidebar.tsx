'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Ticket,
  Users,
  Settings,
  BarChart3,
  LogOut,
  Menu,
  X,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
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
    { href: '/admin/appearance', label: 'Apparence', icon: <Palette className="size-4" /> },
  ],
  [Role.MANAGER]: [
    { href: '/manager', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
    { href: '/manager/builder', label: 'Page builder', icon: <Settings className="size-4" /> },
    { href: '/manager/tickets', label: 'Billets', icon: <Ticket className="size-4" /> },
    { href: '/manager/participants', label: 'Participants', icon: <Users className="size-4" /> },
    { href: '/manager/analytics', label: 'Statistiques', icon: <BarChart3 className="size-4" /> },
    { href: '/manager/profile', label: 'Profil', icon: <Users className="size-4" /> },
    { href: '/manager/appearance', label: 'Apparence', icon: <Palette className="size-4" /> },
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
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {item.icon}
            {!collapsed && item.label}
          </Link>
        );
      })}
    </nav>
  );
}

const COLLAPSE_STORAGE_KEY = 'sidebar-collapsed';

/**
 * DashboardSidebar — navigation adaptative selon le rôle (déduit du pathname).
 *
 * Desktop (≥ md) : panneau détaché (marge + coins arrondis + ombre, plutôt
 * qu'une barre plein bord) et rétractable (icônes seules, bouton dédié,
 * état persisté en localStorage) — refonte 2026-07-17 sur demande utilisateur,
 * inspirée d'un panneau de navigation flottant de référence. Mobile (< md) :
 * tiroir coulissant inchangé (overlay + panneau), mêmes liens, fermé par
 * défaut, fermé automatiquement à la navigation ou au clic sur le fond.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const role = roleFromPathname(pathname);
  const items = navByRole[role] ?? navByRole[Role.CLIENT];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
    setMounted(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-primary">Fluid Events</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Ouvrir le menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
        </div>
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

      <aside
        className={cn(
          'hidden shrink-0 md:sticky md:top-3 md:my-3 md:ml-3 md:flex md:h-[calc(100svh-1.5rem)] md:flex-col md:overflow-hidden md:rounded-2xl md:border md:border-border md:bg-card md:shadow-solid-2',
          mounted && 'transition-[width] duration-200',
          collapsed ? 'md:w-[76px]' : 'md:w-64',
        )}
      >
        <div className={cn('flex h-16 items-center gap-2 border-b px-4', collapsed ? 'justify-center px-0' : 'justify-between')}>
          {collapsed ? (
            <Link
              href="/"
              title="Fluid Events"
              className="flex size-8 items-center justify-center rounded-lg bg-primary font-serif text-sm font-bold text-primary-foreground"
            >
              F
            </Link>
          ) : (
            <>
              <Link href="/" className="flex items-center gap-2 font-bold">
                <span className="text-primary">Fluid Events</span>
              </Link>
              <ThemeToggle />
            </>
          )}
        </div>

        <NavLinks items={items} pathname={pathname} collapsed={collapsed} />

        <div className={cn('border-t p-3', collapsed && 'flex flex-col items-center gap-2')}>
          {collapsed && <ThemeToggle />}
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={cn(!collapsed && 'w-full justify-start text-muted-foreground')}
            title={collapsed ? 'Réduire/agrandir' : undefined}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : (
              <>
                <PanelLeftClose className="size-4" /> Réduire
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={cn(!collapsed && 'w-full justify-start text-muted-foreground')}
            title={collapsed ? 'Déconnexion' : undefined}
            asChild
          >
            <Link href="/auth/login">
              <LogOut className="size-4" /> {!collapsed && 'Déconnexion'}
            </Link>
          </Button>
        </div>
      </aside>
    </>
  );
}
