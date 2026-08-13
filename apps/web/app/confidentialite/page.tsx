import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import { privacyContent } from '@/lib/content/legal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Fluid Events',
  description: "Données collectées par Fluid Events, finalités et droits des utilisateurs.",
};

export default function Page() {
  return (
    <LegalPage
      eyebrow={privacyContent.eyebrow}
      title={privacyContent.title}
      intro={privacyContent.intro}
      sections={privacyContent.sections}
    />
  );
}
