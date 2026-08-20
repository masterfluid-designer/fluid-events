import { SectionEyebrow } from './section-eyebrow';
import { Reveal } from './reveal';

/**
 * Primitives de mise en page des sections publiques (refonte "haute fidélité
 * orncity") — remplacent l'ancienne carte étroite `max-w-190` qui enfermait
 * toute la page : chaque section est désormais pleine largeur, avec son propre
 * fond, un rythme vertical généreux et un conteneur de contenu large.
 *
 * `tone` :
 *  - 'default' → fond de page (transparent)
 *  - 'muted'   → fond légèrement contrasté, pour alterner les sections
 *  - 'accent'  → bande pleine couleur primaire (bandeaux CTA)
 */
export function SectionShell({
  id,
  children,
  tone = 'default',
  className = '',
}: {
  id?: string;
  children: React.ReactNode;
  tone?: 'default' | 'muted' | 'accent';
  className?: string;
}) {
  // `muted` en voile translucide plutôt qu'en couleur fixe : l'organisateur
  // peut choisir son fond de page (thème), un `bg-alabaster` en dur jurerait
  // avec. Un voile se contente d'assombrir/éclaircir ce qui est dessous,
  // quelle que soit la couleur choisie.
  // `section-tone-muted` : classe STABLE, sans style propre, qui sert de prise
  // au CSS quand la page porte une image de fond (voir `.event-has-backdrop`
  // dans globals.css). Ce voile à 3,5 % suffit à démarquer deux sections sur
  // un aplat, mais au-dessus d'une photo il ne produit que de la boue — il y
  // est remplacé par un verre dépoli, qui sépare vraiment.
  const toneClass =
    tone === 'muted'
      ? 'section-tone-muted bg-black/[0.035] dark:bg-white/[0.035]'
      : tone === 'accent'
        ? 'bg-primary text-primary-foreground'
        : '';

  return (
    <section
      id={id}
      // scroll-mt : compense le header sticky pour que le titre de section ne
      // se retrouve pas masqué quand on arrive par un lien d'ancre.
      className={`scroll-mt-20 px-5 py-16 md:px-8 md:py-24 lg:py-28 ${toneClass} ${className}`}
    >
      <Reveal variant={tone === 'accent' ? 'scale' : 'up'} className="mx-auto w-full max-w-6xl">
        {children}
      </Reveal>
    </section>
  );
}

/**
 * En-tête de section : eyebrow + grand titre + description optionnelle, avec
 * une action alignée à droite sur desktop (ex. "Tout voir").
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-4 md:mb-14 md:flex-row md:items-end md:justify-between">
      <Reveal variant="up" className="max-w-2xl">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        {/* Échelle display : les titres de section portent l'identité de la
            page (cf. fidélité orncity) — grande taille, interlignage très
            serré et interlettrage resserré, ce que réclament les display
            condensées proposées dans le thème (Anton, Bebas, Archivo Black). */}
        <h2 className="mt-2.5 font-event text-4xl leading-[0.95] tracking-tight md:text-5xl lg:text-6xl">
          {title}
        </h2>
        {description && (
          <p className="mt-4 text-base leading-relaxed text-waterloo dark:text-manatee md:text-lg">
            {description}
          </p>
        )}
      </Reveal>
      {action && (
        <Reveal variant="fade" delay={120} className="shrink-0">
          {action}
        </Reveal>
      )}
    </div>
  );
}
