'use client';

import { useState } from 'react';

/**
 * SalesTrendChart — Barres verticales "ventes dans le temps" (Analytics,
 * décision produit 2026-07-14). Réutilisé par le dashboard Manager (un seul
 * événement) et le dashboard Admin (toute la plateforme).
 *
 * Un seul axe (revenu) — CDC dataviz : jamais de double axe. Le nombre de
 * billets vendus, échelle différente, est affiché dans l'infobulle au survol
 * plutôt que sur un second axe.
 */
export interface DailySalesPoint {
  date: string; // YYYY-MM-DD
  revenue: number;
  ticketsSold: number;
}

export function SalesTrendChart({
  data,
  currency,
}: {
  data: DailySalesPoint[];
  currency: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const currencyFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency });
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  if (totalRevenue === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune vente confirmée sur les 30 derniers jours.
      </p>
    );
  }

  const maxRevenue = Math.max(1, ...data.map((d) => d.revenue));
  const barWidth = 100 / data.length;
  // Une étiquette sur ~5 jours pour éviter la surcharge (30 barres).
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
        className="h-32 w-full overflow-visible"
        role="img"
        aria-label="Ventes dans le temps, 30 derniers jours"
      >
        {data.map((d, i) => {
          const heightPct = (d.revenue / maxRevenue) * 92; // marge pour les coins arrondis
          const x = i * barWidth;
          const isHovered = hoverIndex === i;
          return (
            <rect
              key={d.date}
              x={x + barWidth * 0.12}
              y={100 - heightPct}
              width={barWidth * 0.76}
              height={Math.max(heightPct, 1.5)}
              rx={1.5}
              className={isHovered ? 'fill-primary' : 'fill-accent-terracotta dark:fill-accent-terracotta-dark'}
              opacity={isHovered ? 1 : 0.85}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          );
        })}
      </svg>

      <div className="mt-1.5 flex text-[10px] text-muted-foreground">
        {data.map((d, i) => (
          <div key={d.date} style={{ width: `${barWidth}%` }} className="text-center">
            {i % labelEvery === 0 ? dateFmt.format(new Date(d.date)) : ''}
          </div>
        ))}
      </div>

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-solid-2"
          style={{ left: `${hoverIndex * barWidth + barWidth / 2}%` }}
        >
          <div className="font-semibold">{dateFmt.format(new Date(data[hoverIndex].date))}</div>
          <div className="text-muted-foreground">{currencyFmt.format(data[hoverIndex].revenue)}</div>
          <div className="text-muted-foreground">
            {data[hoverIndex].ticketsSold} billet{data[hoverIndex].ticketsSold > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
