'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Mail, ScanLine, Trash2, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api, apiDelete, apiPatch, apiPost, ApiError } from '@/lib/api';
import { avecEvenement, useEvenementActif } from '@/lib/evenement-actif';

/**
 * Manager — Agents de contrôle (2026-08-19).
 *
 * Aucun écran ne créait de scanner : ils ne naissaient que du script de seed,
 * ce qui rendait la billetterie invérifiable à l'entrée pour tout événement
 * réel. Deux chemins, parce que deux situations :
 *
 *  - inviter quelqu'un qui n'a pas de compte (un agent recruté pour la
 *    soirée) — il reçoit un lien pour choisir son mot de passe ;
 *  - promouvoir un compte client existant (un bénévole qui a déjà sa place).
 *
 * La promotion est annoncée pour ce qu'elle est : un utilisateur n'a qu'un
 * rôle, le client promu perd donc l'accès à ses propres billets. Le retrait
 * lui rend son rôle.
 */

interface ScannerRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  hasAcceptedInvite: boolean;
  promotedFrom: string | null;
  scanCount: number;
  createdAt: string;
}

export default function ManagerScannersPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [promoteEmail, setPromoteEmail] = useState('');

  // L'événement porté par l'URL (2026-08-21). Absent, le serveur retombe
  // sur celui du manager mono-événement — le cas de tous jusqu'ici.
  const evenement = useEvenementActif();

  const { data: scanners, isLoading, isError } = useQuery({
    queryKey: ['manager-scanners', evenement],
    queryFn: () => api<ScannerRow[]>(avecEvenement('/api/scanners', evenement)),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['manager-scanners', evenement] });
  const fail = (err: unknown, repli: string) =>
    toast.error(err instanceof ApiError ? err.message : repli);

  const invite = useMutation({
    mutationFn: () => apiPost<{ emailSent: boolean }>(avecEvenement('/api/scanners/invite', evenement), { name, email }),
    onSuccess: (res) => {
      // On distingue les deux : un compte créé dont l'email n'est pas parti
      // demande une relance, pas un second compte.
      toast.success(
        res?.emailSent
          ? 'Invitation envoyée'
          : 'Compte créé, mais l’email n’est pas parti — renvoyez l’invitation',
      );
      setName('');
      setEmail('');
      refresh();
    },
    onError: (err) => fail(err, 'Invitation impossible'),
  });

  const promote = useMutation({
    mutationFn: () => apiPost(avecEvenement('/api/scanners/promote', evenement), { email: promoteEmail }),
    onSuccess: () => {
      toast.success('Compte promu — il accède désormais au scanner');
      setPromoteEmail('');
      refresh();
    },
    onError: (err) => fail(err, 'Promotion impossible'),
  });

  const toggleActive = useMutation({
    mutationFn: (s: ScannerRow) => apiPatch(avecEvenement(`/api/scanners/${s.id}/active`, evenement), { isActive: !s.isActive }),
    onSuccess: () => {
      toast.success('Accès mis à jour');
      refresh();
    },
    onError: (err) => fail(err, 'Changement impossible'),
  });

  const remove = useMutation({
    mutationFn: (s: ScannerRow) => apiDelete(avecEvenement(`/api/scanners/${s.id}`, evenement)),
    onSuccess: () => {
      toast.success('Agent retiré');
      refresh();
    },
    onError: (err) => fail(err, 'Retrait impossible'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !scanners) {
    return <div className="p-6 text-sm text-muted-foreground">Liste illisible.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agents de contrôle</h1>
        <p className="text-sm text-muted-foreground">
          {scanners.length === 0
            ? 'Aucun agent — personne ne peut valider de billet à l’entrée.'
            : `${scanners.length} agent${scanners.length > 1 ? 's' : ''} · ${scanners.reduce((n, s) => n + s.scanCount, 0)} scan${scanners.reduce((n, s) => n + s.scanCount, 0) > 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Mail className="size-4" /> Inviter par email
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pour quelqu’un qui n’a pas encore de compte. Il recevra un lien pour choisir son mot de
            passe.
          </p>
          <form
            className="mt-4 flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <Input
              required
              placeholder="Nom de l’agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              required
              type="email"
              placeholder="adresse@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={invite.isPending} className="w-fit">
              <UserPlus className="size-4" />
              {invite.isPending ? 'Envoi...' : 'Envoyer l’invitation'}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <ScanLine className="size-4" /> Promouvoir un compte existant
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pour un client déjà inscrit — un bénévole qui a acheté sa place, par exemple.
          </p>
          <form
            className="mt-4 flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              promote.mutate();
            }}
          >
            <Input
              required
              type="email"
              placeholder="Son adresse email"
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
            />
            {/* Dit AVANT le clic ce que la promotion coûte : un compte n'a
                qu'un rôle, le client promu perd l'accès à ses billets. */}
            <p className="rounded-lg border border-dashed border-amber-500/50 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
              Un compte n’a qu’un rôle : tant qu’il est agent de contrôle, il n’accède plus à ses
              propres billets. Le retirer lui rend son accès.
            </p>
            <Button type="submit" variant="outline" disabled={promote.isPending} className="w-fit">
              {promote.isPending ? 'Promotion...' : 'Promouvoir'}
            </Button>
          </form>
        </Card>
      </div>

      {scanners.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Aucun agent de contrôle pour le moment.
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {scanners.map((s, i) => (
            <div
              key={s.id}
              className={`flex flex-wrap items-center justify-between gap-3 px-4.5 py-3.5 ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">{s.email}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!s.hasAcceptedInvite && (
                  <Badge variant="outline" className="w-fit">
                    Invitation en attente
                  </Badge>
                )}
                {s.promotedFrom && (
                  <Badge variant="secondary" className="w-fit">
                    Promu depuis {s.promotedFrom.toLowerCase()}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {s.scanCount} scan{s.scanCount > 1 ? 's' : ''}
                </span>
                <Badge variant={s.isActive ? 'success' : 'outline'} className="w-fit">
                  {s.isActive ? 'Actif' : 'Suspendu'}
                </Badge>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleActive.mutate(s)}
                    disabled={toggleActive.isPending}
                    aria-label={s.isActive ? `Suspendre ${s.name}` : `Réactiver ${s.name}`}
                    title={
                      s.isActive
                        ? 'Suspendre — il ne pourra plus valider de billet'
                        : 'Réactiver'
                    }
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    {s.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(s)}
                    disabled={remove.isPending || s.scanCount > 0}
                    aria-label={`Retirer ${s.name}`}
                    // Un agent qui a déjà validé des billets n'est pas
                    // supprimable : son journal doit rester traçable.
                    title={
                      s.scanCount > 0
                        ? 'A déjà validé des billets — suspendez-le plutôt'
                        : 'Retirer'
                    }
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
