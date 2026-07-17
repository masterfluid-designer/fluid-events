'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { COUNTRIES, countryFlagEmoji } from '@/lib/countries';

/**
 * CountryPicker — sélecteur de pays/indicatif façon Telegram (décision
 * produit 2026-07-15) : bouton drapeau + indicatif, ouvre un panneau
 * recherchable par nom de pays OU par indicatif (avec ou sans "+"), liste
 * stylisée (pas un `<select>` natif brut). Fermeture au clic extérieur.
 */
export function CountryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso2: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.iso2 === value) ?? COUNTRIES[0];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const qDigits = q.replace(/\D/g, '');
    return COUNTRIES.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const dialMatch = qDigits.length > 0 && c.dialCode.startsWith(qDigits);
      return nameMatch || dialMatch;
    });
  }, [search]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choisir un indicatif pays"
        className="flex h-9 w-28 shrink-0 items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span>{countryFlagEmoji(selected.iso2)}</span>
          <span>+{selected.dialCode}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1.5 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-solid-2">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pays ou indicatif (ex : 228)"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">Aucun résultat</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.iso2}
                  type="button"
                  onClick={() => {
                    onChange(c.iso2);
                    setSearch('');
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                    c.iso2 === value ? 'bg-accent/60 font-medium' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span>{countryFlagEmoji(c.iso2)}</span>
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">+{c.dialCode}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
