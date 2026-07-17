'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Globe, User as UserIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

/**
 * Manager — Mon profil. Lecture seule : email et téléphone ne sont
 * volontairement modifiables depuis aucun formulaire (décision produit
 * 2026-07-15) — le téléphone est capturé/vérifié une seule fois via
 * `PhoneVerificationGate` (code WhatsApp, juste après l'auth), le pays est
 * déduit automatiquement de son indicatif. Même page que `/client/profile`,
 * dupliquée plutôt que partagée : les deux dashboards (Manager/Client) ne
 * partagent aucun composant de page aujourd'hui, cohérent avec le reste du
 * projet (pas de package UI commun).
 */

interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  phone: string | null;
  country: string | null;
  avatarUrl: string | null;
  phoneVerifiedAt: string | null;
}

export default function ManagerProfilePage() {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<CurrentUser>('/api/auth/me'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="p-4 text-sm text-muted-foreground sm:p-6">
        Impossible de charger votre profil pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mon profil</h1>
        <p className="text-sm text-muted-foreground">
          Lecture seule — email et téléphone ne peuvent pas être modifiés ici.
        </p>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          <div className="flex items-center gap-3 px-4.5 py-4">
            <span className="text-muted-foreground"><UserIcon className="size-4" /></span>
            <div>
              <div className="text-xs text-muted-foreground">Nom</div>
              <div className="text-sm font-medium">{user.name ?? 'Non renseigné'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4.5 py-4">
            <span className="text-muted-foreground"><Mail className="size-4" /></span>
            <div>
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="text-sm font-medium">{user.email}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4.5 py-4">
            <span className="text-muted-foreground"><Phone className="size-4" /></span>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Téléphone</div>
              <div className="text-sm font-medium">{user.phone ?? 'Non renseigné'}</div>
            </div>
            {user.phone && (
              <Badge variant={user.phoneVerifiedAt ? 'success' : 'warning'}>
                {user.phoneVerifiedAt ? 'Vérifié' : 'Non vérifié'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 px-4.5 py-4">
            <span className="text-muted-foreground"><Globe className="size-4" /></span>
            <div>
              <div className="text-xs text-muted-foreground">Pays</div>
              <div className="text-sm font-medium">{user.country ?? 'Non renseigné'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
