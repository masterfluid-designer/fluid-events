"use client";

import { useRef } from "react";
import { Palette, QrCode, BarChart3, CheckCircle2 } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";

const PANELS = [
  {
    id: "builder",
    label: "business-website / Ajoutez un bloc billetterie",
    icon: Palette,
    render: (
      <div className="grid h-full grid-cols-[200px_1fr] gap-4 p-6">
        <div className="space-y-2 rounded-xl bg-white/5 p-4">
          <div className="h-2 w-2/3 rounded-full bg-white/20" />
          <div className="h-2 w-1/2 rounded-full bg-white/10" />
          <div className="mt-4 h-16 rounded-lg bg-primary/30" />
          <div className="h-2 w-3/4 rounded-full bg-white/10" />
          <div className="h-2 w-1/2 rounded-full bg-white/10" />
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-3 h-6 w-1/3 rounded-full bg-white/20" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 rounded-lg bg-primary/40" />
            <div className="h-20 rounded-lg bg-white/10" />
            <div className="h-20 rounded-lg bg-white/10" />
          </div>
          <div className="mt-3 h-2 w-2/3 rounded-full bg-white/10" />
        </div>
      </div>
    ),
  },
  {
    id: "scanner",
    label: "scanner-pwa / Validation billet en cours",
    icon: QrCode,
    render: (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex size-40 items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-white/5">
          <QrCode className="size-20 text-white/40" />
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-emerald-400">
          <CheckCircle2 className="size-4" />
          <span className="text-metatitle font-medium">Billet valide — accès autorisé</span>
        </div>
      </div>
    ),
  },
  {
    id: "dashboard",
    label: "manager-dashboard / Ventes en direct",
    icon: BarChart3,
    render: (
      <div className="grid h-full grid-cols-3 gap-4 p-6">
        <div className="col-span-2 rounded-xl bg-white/5 p-4">
          <div className="mb-3 h-2 w-1/4 rounded-full bg-white/20" />
          <div className="flex h-32 items-end gap-2">
            {[40, 65, 35, 80, 55, 90, 60].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/50"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="h-2 w-2/3 rounded-full bg-white/20" />
            <div className="mt-2 h-4 w-1/2 rounded-full bg-primary/40" />
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="h-2 w-2/3 rounded-full bg-white/20" />
            <div className="mt-2 h-4 w-1/3 rounded-full bg-primary/40" />
          </div>
        </div>
      </div>
    ),
  },
];

export default function ProductStage() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const labelRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const panels = panelRefs.current.filter(Boolean) as HTMLDivElement[];
      if (panels.length === 0) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.set(panels, { opacity: 0 });
      gsap.set(panels[0], { opacity: 1 });
      if (labelRef.current) labelRef.current.textContent = PANELS[0].label;

      if (reduceMotion) return;

      // La boîte grossit progressivement à mesure qu'elle entre dans le
      // viewport, pour atteindre sa taille normale pile au moment où elle
      // s'épingle (cf. captures Antigravity, transition hero → stage produit).
      if (frameRef.current) {
        gsap.fromTo(
          frameRef.current,
          { scale: 0.55, opacity: 0.4 },
          {
            scale: 1,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top bottom",
              end: "top top",
              scrub: true,
            },
          },
        );
      }

      const segments = panels.length - 1;
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=150%",
          pin: true,
          scrub: 0.6,
          onUpdate: (self) => {
            const idx = Math.min(
              panels.length - 1,
              Math.round(self.progress * segments),
            );
            if (labelRef.current) labelRef.current.textContent = PANELS[idx].label;
          },
        },
      });

      panels.forEach((panel, i) => {
        if (i === 0) return;
        tl.to(panels[i - 1], { opacity: 0, duration: 0.3 }, i - 0.2).to(
          panel,
          { opacity: 1, duration: 0.3 },
          i - 0.2,
        );
      });
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-blackho py-20"
    >
      <div className="relative mx-auto w-full max-w-[1600px] px-6 md:px-12">
        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0b] shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
            <span className="size-2.5 rounded-full bg-[#FF5F57]" />
            <span className="size-2.5 rounded-full bg-[#FFBD2E]" />
            <span className="size-2.5 rounded-full bg-[#28C840]" />
            <span ref={labelRef} className="ml-3 truncate text-metatitle text-white/50" />
          </div>
          <div className="relative aspect-video">
            {PANELS.map((panel, i) => (
              <div
                key={panel.id}
                ref={(el) => {
                  panelRefs.current[i] = el;
                }}
                className="absolute inset-0"
              >
                {panel.render}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
