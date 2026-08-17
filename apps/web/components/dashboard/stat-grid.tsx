import { Card, CardContent } from '@/components/ui/card';

/**
 * StatGrid — Rangée de compteurs des tableaux de bord.
 *
 * Trois colonnes dès le mobile (décision produit 2026-08-17) : quatre cartes
 * empilées imposaient de faire défiler un écran entier pour quatre chiffres.
 * La PREMIÈRE carte garde la pleine largeur — c'est par convention la valeur
 * la plus longue (un montant avec sa devise) et la plus regardée ; les
 * suivantes, courtes par nature, tiennent côte à côte.
 *
 * Extrait après avoir constaté le même balisage copié sur trois pages
 * (dashboard Manager, Statistiques, dashboard Admin) : une retouche de mise
 * en page devait sinon être refaite trois fois.
 */

export interface StatItem {
  label: string;
  value: string;
  icon: React.ReactNode;
}

export function StatGrid({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-4">
      {stats.map((s, i) => {
        const wide = i === 0;
        return (
          <Card key={s.label} className={wide ? 'col-span-3 lg:col-span-1' : undefined}>
            <CardContent className={wide ? 'p-5' : 'p-3.5 lg:p-5'}>
              <div className="flex items-start justify-between gap-1.5">
                <span
                  className={`text-muted-foreground ${
                    wide ? 'text-sm' : 'text-[11px] leading-tight lg:text-sm'
                  }`}
                >
                  {s.label}
                </span>
                <span className="shrink-0 text-accent-terracotta dark:text-accent-terracotta-dark">
                  {s.icon}
                </span>
              </div>
              {/* tabular-nums : des compteurs côte à côte ne doivent pas
                  danser d'un chiffre à l'autre au rafraîchissement. */}
              <div
                className={`font-bold tabular-nums ${
                  wide ? 'mt-2 text-2xl' : 'mt-1.5 text-lg lg:mt-2 lg:text-2xl'
                }`}
              >
                {s.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
