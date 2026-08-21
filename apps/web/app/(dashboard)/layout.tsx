import { Suspense } from 'react';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { ImpersonationBanner } from '@/components/dashboard/impersonation-banner';
import { PhoneVerificationGate } from '@/components/dashboard/phone-verification-gate';

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
    <PhoneVerificationGate>
      {/*
        L'événement affiché est lu dans l'URL (`?event=`), par la barre latérale
        comme par les pages. `useSearchParams()` fait sortir du pré-rendu
        statique, et Next refuse de construire une page qui en use sans limite
        déclarée : sans cette frontière, `next build` échoue sur TOUTES les
        pages du tableau de bord (2026-08-21).

        La poser ici plutôt que dans chaque page : ces écrans exigent de toute
        façon une session, aucun n'a rien d'utile à pré-rendre.
      */}
      <Suspense fallback={<div className="min-h-svh bg-background" />}>
        <div className="flex min-h-svh flex-col bg-background md:flex-row">
          <DashboardSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <ImpersonationBanner />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </Suspense>
    </PhoneVerificationGate>
  );
}
