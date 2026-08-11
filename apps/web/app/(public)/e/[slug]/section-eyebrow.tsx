/**
 * SectionEyebrow — petit label en majuscules au-dessus des titres de section
 * (pattern visuel orncity : "— BILLETTERIE", "SUR SCÈNE"), réutilisé sur
 * tous les blocs publics de la page événement. Couleurs héritées des tokens
 * Fluid Events existants — aucune nouvelle couleur.
 */
export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-manatee dark:text-waterloo">
      <span className="h-px w-4 bg-accent-terracotta dark:bg-accent-terracotta-dark" aria-hidden="true" />
      {children}
    </div>
  );
}
