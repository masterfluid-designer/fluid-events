'use client';

import { ColorThemePicker } from '@/components/ui/color-theme-picker';

/**
 * Admin — Apparence. Choix du thème de couleur (page dédiée, 2026-07-17) —
 * préférence personnelle par navigateur (comme le bouton clair/sombre déjà
 * présent dans la sidebar), pas un réglage plateforme. S'applique
 * instantanément au clic, aucune sauvegarde à valider.
 */
export default function AdminAppearancePage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Apparence</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez le thème de couleur de votre tableau de bord — le mode clair/sombre reste
          géré séparément, depuis le bouton en haut de la sidebar.
        </p>
      </div>

      <ColorThemePicker />
    </div>
  );
}
