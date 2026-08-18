import type { ResolvedEventTheme } from '@/lib/event-theme';

/**
 * EventBackdrop — image de couverture en fond de TOUTE la page publique
 * (décision produit 2026-08-18). À ne pas confondre avec `Event.coverImageUrl`,
 * qui illustre le hero et les partages sociaux : celle-ci est un décor continu,
 * derrière l'ensemble des sections.
 *
 * `fixed` plutôt que `background-attachment: fixed` : cette propriété est
 * ignorée par Safari iOS depuis toujours (l'image y défile avec la page, en
 * s'étirant), et coûte cher en repeinture ailleurs. Une couche fixe en
 * `position: fixed` donne le même effet de parallaxe partout.
 *
 * `aria-hidden` : c'est un décor, il n'apporte aucune information et n'a rien
 * à faire dans le fil d'un lecteur d'écran.
 */
export function EventBackdrop({ backdrop }: { backdrop: NonNullable<ResolvedEventTheme['backdrop']> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="size-full bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('${backdrop.imageUrl}')`,
          // `scale` avec le flou : sans lui, le flou laisse des bords
          // transparents sur les quatre côtés de la couche.
          ...(backdrop.blur ? { filter: 'blur(10px)', transform: 'scale(1.06)' } : {}),
        }}
      />
      {/*
        Le voile n'est pas décoratif : c'est lui qui garde le texte lisible
        par-dessus n'importe quelle affiche. Son opacité est déjà bornée à son
        plancher par `resolveEventTheme` — rien à décider ici.

        Sa COULEUR, elle, suit l'encre de la page et non un goût : en mode
        clair le texte est sombre, il lui faut donc un voile clair ; en mode
        sombre le texte est clair, il lui faut un voile noir. Un voile noir
        dans les deux cas — première version de ce composant — rendait la page
        claire strictement illisible, du texte sombre sur une photo assombrie.
      */}
      <div
        className="absolute inset-0 bg-white dark:bg-black"
        style={{ opacity: backdrop.overlay / 100 }}
      />
    </div>
  );
}
