import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import { termsContent } from '@/lib/content/legal';

export const metadata: Metadata = {
  title: 'Conditions générales — Fluid Events',
  description: "Conditions d'utilisation de la plateforme et de vente des billets.",
};

export default function Page() {
  return (
    <LegalPage
      eyebrow={termsContent.eyebrow}
      title={termsContent.title}
      intro={termsContent.intro}
      sections={termsContent.sections}
    />
  );
}
