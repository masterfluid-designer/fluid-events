import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import { legalNoticeContent } from '@/lib/content/legal';

export const metadata: Metadata = {
  title: 'Mentions légales — Fluid Events',
  description: "Informations sur l'éditeur et l'hébergeur du site Fluid Events.",
};

export default function Page() {
  return (
    <LegalPage
      eyebrow={legalNoticeContent.eyebrow}
      title={legalNoticeContent.title}
      intro={legalNoticeContent.intro}
      sections={legalNoticeContent.sections}
    />
  );
}
