import { SectionEyebrow } from './section-eyebrow';

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
  const toneClass =
    tone === 'muted'
      ? 'bg-alabaster dark:bg-blackho'
      : tone === 'accent'
        ? 'bg-primary text-primary-foreground'
        : '';

  return (
    <section
      id={id}
      // scroll-mt : compense le header sticky pour que le titre de section ne
      // se retrouve pas masqué quand on arrive par un lien d'ancre.
      className={`scroll-mt-20 px-5 py-14 md:px-8 md:py-20 ${toneClass} ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
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
    <div className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h2 className="mt-2 font-serif text-3xl leading-[1.05] md:text-4xl lg:text-5xl">{title}</h2>
        {description && (
          <p className="mt-3 text-sm leading-relaxed text-waterloo dark:text-manatee md:text-base">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
