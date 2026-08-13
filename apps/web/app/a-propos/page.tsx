import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import { aboutContent } from '@/lib/content/legal';

export const metadata: Metadata = {
  title: 'À propos — Fluid Events',
  description: "Fluid Events, plateforme de billetterie en ligne pour les organisateurs d'événements en Afrique de l'Ouest.",
};

export default function Page() {
  return (
    <LegalPage
      eyebrow={aboutContent.eyebrow}
      title={aboutContent.title}
      intro={aboutContent.intro}
      sections={aboutContent.sections}
    />
  );
}
