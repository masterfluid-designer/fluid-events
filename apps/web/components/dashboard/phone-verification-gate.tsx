'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, apiPost, ApiError } from '@/lib/api';

/**
 * PhoneVerificationGate — bloque tout le dashboard (Manager/Client
 * uniquement) tant que le téléphone n'est pas soumis ET vérifié par code
 * WhatsApp (décision produit 2026-07-15). Le pays est déduit automatiquement
 * de l'indicatif — jamais demandé séparément à l'utilisateur.
 *
 * Rendu en overlay plein écran sans possibilité de fermeture : remplace
 * entièrement `children` plutôt que de les superposer (RULES.md — "bloque le
 * processus... avant de continuer le workflow", pas juste un rappel discret).
 * Admin/Scanner ne sont jamais concernés (comptes créés/gérés différemment,
 * pas de flux d'inscription self-service).
 */

const GATED_ROLES = new Set(['MANAGER', 'CLIENT']);

interface CurrentUser {
  id: string;
  role: string;
  phone: string | null;
  phoneVerifiedAt: string | null;
  isImpersonating: boolean;
}

export function PhoneVerificationGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<CurrentUser>('/api/auth/me'),
    retry: false,
  });

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const requestVerification = useMutation({
    mutationFn: () =>
      apiPost<{ phone: string; country: string | null }>('/api/auth/phone/request-verification', { phone }),
    onSuccess: (data) => {
      setSentTo(data.phone);
      setCode('');
      setStep('code');
      toast.success('Code envoyé par WhatsApp');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible d'envoyer le code — vérifiez le numéro");
    },
  });

  const confirmVerification = useMutation({
    mutationFn: () => apiPost('/api/auth/phone/confirm-verification', { code }),
    onSuccess: () => {
      toast.success('Numéro vérifié');
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Code incorrect ou expiré');
    },
  });

  // Tant qu'on ne sait pas encore qui est l'utilisateur, on ne bloque rien
  // (évite un flash de la modale avant que /api/auth/me ait répondu).
  if (isLoading || !user) return <>{children}</>;

  // Un Admin en impersonation ne doit jamais être bloqué par le compte
  // Manager qu'il inspecte/assiste — la vérification reste due par le vrai
  // titulaire du compte, à sa prochaine connexion normale.
  const needsVerification =
    !user.isImpersonating && GATED_ROLES.has(user.role) && (!user.phone || !user.phoneVerifiedAt);
  if (!needsVerification) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-solid-2">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="size-5 text-emerald-500" />
          <h2 className="font-serif text-lg">Vérification du téléphone</h2>
        </div>

        {step === 'phone' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestVerification.mutate();
            }}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              Requis pour continuer — un code de vérification vous sera envoyé par WhatsApp.
            </p>
            <Input
              required
              type="tel"
              placeholder="+228 90 00 00 00"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={requestVerification.isPending}>
              {requestVerification.isPending ? 'Envoi...' : 'Recevoir le code'}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmVerification.mutate();
            }}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              Code envoyé au <span className="font-medium">{sentTo}</span>. Entrez les 6 chiffres reçus par
              WhatsApp.
            </p>
            <Input
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-lg tracking-[0.3em]"
            />
            <Button type="submit" className="w-full" disabled={confirmVerification.isPending}>
              {confirmVerification.isPending ? 'Vérification...' : 'Vérifier'}
            </Button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full text-center text-xs text-muted-foreground underline"
            >
              Modifier le numéro / renvoyer le code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
