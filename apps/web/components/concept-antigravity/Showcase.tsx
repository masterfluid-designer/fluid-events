"use client";

import { useRef } from "react";
import { CreditCard, QrCode, Palette, BarChart3, Play } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "@/lib/gsap";
import ScrollReveal from "@/components/motion/ScrollReveal";
import Typewriter from "@/components/motion/Typewriter";

const PANELS = [
  {
    id: "builder",
    icon: Palette,
    title: "No-code Builder",
    description:
      "Composez la page de votre événement par blocs. Hero, description, galerie — sans écrire une ligne de code.",
    glow: "from-primary/40 via-primary/10 to-transparent",
  },
  {
    id: "scanner",
    icon: QrCode,
    title: "Scanner PWA",
    description:
      "Transformez n'importe quel téléphone en scanner de billets QR. Installation en 1 clic, fonctionne hors ligne.",
    glow: "from-emerald-500/30 via-emerald-500/10 to-transparent",
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "Paiements Mobile Money",
    description:
      "Kkiapay, CinetPay, FedaPay — acceptez les paiements que vos clients utilisent vraiment.",
    glow: "from-amber-500/30 via-amber-500/10 to-transparent",
  },
  {
    id: "dashboard",
    icon: BarChart3,
    title: "Dashboard temps réel",
    description:
      "Suivez vos ventes, scans et revenus en direct. Export CSV des participants.",
    glow: "from-sky-500/30 via-sky-500/10 to-transparent",
  },
];

export default function Showcase() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || !containerRef.current) return;

      const count = PANELS.length - 1;

      // Chaque geste de scroll amène la prochaine fonctionnalité pile au
      // centre du viewport (elle occupe déjà toute la hauteur) : le scroll
      // se cale sur des paliers plutôt que de s'arrêter à mi-chemin.
      const st = ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top top",
        end: "bottom bottom",
        snap: {
          snapTo: (value: number) => Math.round(value * count) / count,
          duration: 0.5,
          ease: "power1.inOut",
        },
      });

      return () => st.kill();
    },
    { scope: containerRef },
  );

  return (
    <div id="features" ref={containerRef}>
      {PANELS.map((panel, i) => {
        const Icon = panel.icon;
        const reverse = i % 2 === 1;
        return (
          <section
            key={panel.id}
            className={`flex min-h-svh flex-col items-center justify-center gap-12 px-6 py-24 md:gap-20 md:px-12 lg:gap-28 ${
              reverse ? "md:flex-row-reverse" : "md:flex-row"
            }`}
          >
            <ScrollReveal className="max-w-md text-center md:flex-1 md:text-left" y={30}>
              <h3 className="font-space-grotesk mb-4 text-2xl font-medium text-black md:text-5xl dark:text-white">
                <Typewriter once segments={[{ text: panel.title }]} />
              </h3>
              <p className="text-regular text-waterloo dark:text-manatee">
                {panel.description}
              </p>
            </ScrollReveal>

            <ScrollReveal className="flex justify-center md:flex-1" y={50} delay={0.1}>
              <div className="relative aspect-9/16 w-[230px] overflow-hidden rounded-[2.5rem] border border-stroke bg-white shadow-solid-l sm:w-[280px] md:w-[320px] dark:border-strokedark dark:bg-blacksection">
                <div
                  className={`absolute inset-0 bg-radial ${panel.glow} opacity-70 dark:opacity-90`}
                />
                <div className="relative flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex size-20 items-center justify-center rounded-full bg-white/80 shadow-solid-7 backdrop-blur dark:bg-blackho/80">
                      <Icon className="text-primary size-9" />
                    </div>
                    <div className="flex size-11 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur">
                      <Play className="ml-0.5 size-4 fill-current" />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </section>
        );
      })}
    </div>
  );
}
