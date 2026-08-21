'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { useMesEvenements, useEvenementActif } from '@/lib/evenement-actif';

/**
 * Sélecteur d'événement du tableau de bord (2026-08-21).
 *
 * Ne s'affiche QUE si le manager en porte plusieurs. Un manager mono-événement
 * — tous ceux d'avant le palier Premium — voit exactement le tableau de bord
 * qu'il avait, sans une commande de plus à comprendre.
 *
 * Changer d'événement réécrit l'URL de la page courante plutôt que de renvoyer
 * à l'accueil : on reste sur la billetterie, ou sur les participants, en
 * changeant seulement de quel événement il s'agit.
 */
export function SelecteurEvenement() {
  const router = useRouter();
  const pathname = usePathname();
  const parametres = useSearchParams();
  const actif = useEvenementActif();
  const { data: evenements } = useMesEvenements();

  const plusieurs = (evenements?.length ?? 0) > 1;

  /*
   * Dès qu'il y a plusieurs événements, l'URL doit en désigner un. Sans cela
   * chaque page demanderait « lequel ? » au serveur et recevrait un refus :
   * le tableau de bord serait en impasse tant que l'organisateur n'aurait pas
   * touché au sélecteur.
   *
   * `replace` et non `push` : cette normalisation ne doit pas laisser une
   * étape dans l'historique, sinon le bouton Retour n'en sortirait jamais.
   */
  useEffect(() => {
    if (!plusieurs || actif || !evenements) return;
    const suivants = new URLSearchParams(parametres.toString());
    suivants.set('event', evenements[0].id);
    router.replace(`${pathname}?${suivants.toString()}`);
  }, [plusieurs, actif, evenements, parametres, pathname, router]);

  if (!evenements || !plusieurs) return null;

  // Sans choix explicite, c'est le premier — le même que celui vers lequel le
  // serveur retombe. L'affichage ne doit pas prétendre autre chose.
  const courant = actif ?? evenements[0].id;

  function choisir(id: string) {
    const suivants = new URLSearchParams(parametres.toString());
    suivants.set('event', id);
    router.push(`${pathname}?${suivants.toString()}`);
  }

  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <select
        value={courant}
        onChange={(e) => choisir(e.target.value)}
        aria-label="Événement affiché"
        className="w-full appearance-none rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {evenements.map((evenement) => (
          <option key={evenement.id} value={evenement.id}>
            {evenement.title}
            {evenement.status !== 'PUBLISHED' ? ' — brouillon' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
