'use client';

import { Ticket } from 'lucide-react';
import Link from 'next/link';

const footerLinks = {
  produit: [
    { label: 'Features', href: '#' },
    { label: 'Tarifs', href: '#' },
    { label: 'Scanner', href: '#' },
    { label: 'Builder', href: '#' },
  ],
  ressources: [
    { label: 'Documentation', href: '#' },
    { label: 'API', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  legal: [
    { label: "Conditions d'utilisation", href: '#' },
    { label: 'Politique de confidentialité', href: '#' },
  ],
};

const socialIcons = [
  { label: 'Twitter', href: '#' },
  { label: 'LinkedIn', href: '#' },
  { label: 'GitHub', href: '#' },
];

export default function Footer() {
  return (
    <footer className="border-t border-stroke bg-white dark:border-strokedark dark:bg-black">
      <div className="mx-auto max-w-c-1390 px-4 md:px-8 2xl:px-0">
        <div className="py-10 lg:py-15">
          {/* ── Top row ── */}
          <div className="flex flex-wrap justify-between gap-8">
            {/* Brand col */}
            <div className="max-w-xs">
              <Link href="/" className="mb-4 inline-flex items-center gap-2">
                <Ticket className="h-7 w-7 text-primary" />
                <span className="text-itemtitle2 font-medium text-black dark:text-white">
                  Fluid Events
                </span>
              </Link>
              <p className="text-waterloo">
                Plateforme de billetterie et gestion d'événements pour
                l'Afrique.
              </p>
              <div className="mt-5 flex items-center gap-3">
                {socialIcons.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-stroke text-waterloo transition-colors hover:border-primary hover:text-primary dark:border-strokedark dark:hover:border-primary"
                  >
                    <span className="text-sm font-medium">
                      {social.label.charAt(0)}
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* Links col — Produit */}
            <div>
              <h4 className="mb-5 text-itemtitle2 font-medium text-black dark:text-white">
                Produit
              </h4>
              <ul className="space-y-3">
                {footerLinks.produit.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-waterloo transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Links col — Ressources */}
            <div>
              <h4 className="mb-5 text-itemtitle2 font-medium text-black dark:text-white">
                Ressources
              </h4>
              <ul className="space-y-3">
                {footerLinks.ressources.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-waterloo transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Links col — Légal */}
            <div>
              <h4 className="mb-5 text-itemtitle2 font-medium text-black dark:text-white">
                Légal
              </h4>
              <ul className="space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-waterloo transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Bottom row ── */}
          <div className="mt-10 flex flex-wrap justify-between border-t border-stroke pt-8 text-sm text-waterloo dark:border-strokedark">
            <p>© 2026 Fluid Events. Tous droits réservés.</p>
            <p>Développé en Côte d'Ivoire 🇨🇮</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
