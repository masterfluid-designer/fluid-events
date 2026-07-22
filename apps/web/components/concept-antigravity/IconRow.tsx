"use client";

import { useMemo, useRef } from "react";
import {
  CreditCard,
  QrCode,
  Palette,
  ShieldCheck,
  BarChart3,
  Smartphone,
  Ticket,
  Calendar,
} from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

const ICONS = [
  CreditCard,
  QrCode,
  Palette,
  ShieldCheck,
  BarChart3,
  Smartphone,
  Ticket,
  Calendar,
];

// Ordre "mélangé" figé à la main (pas de Math.random() au rendu, pour
// rester déterministe entre le rendu serveur et le client) — répété pour
// former une longue bande plutôt qu'une simple rangée de 8.
const SEQUENCE = [3, 0, 6, 1, 5, 2, 7, 4, 1, 6, 0, 3, 7, 2, 5, 4, 6, 1, 3, 0, 5, 7, 2, 4, 6, 0, 1, 7, 3, 5, 2, 4];

const AMPLITUDE = 30;
const WAVE_STEP = 0.55;

export default function IconRow() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const iconEls = useRef<HTMLDivElement[]>([]);

  const sequence = useMemo(
    () => SEQUENCE.map((idx) => ICONS[idx % ICONS.length]),
    [],
  );

  useGSAP(
    () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      const icons = iconEls.current.filter(Boolean);
      if (!section || !track || icons.length === 0) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      const st = ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.4,
        onUpdate: (self) => {
          const progress = self.progress;
          const travel = Math.max(track.scrollWidth - section.clientWidth, 0);
          gsap.set(track, { x: -progress * travel * 0.7 });
          icons.forEach((icon, i) => {
            const phase = i * WAVE_STEP + progress * Math.PI * 5;
            gsap.set(icon, { y: Math.sin(phase) * AMPLITUDE });
          });
        },
      });

      return () => st.kill();
    },
    { scope: sectionRef, dependencies: [sequence.length] },
  );

  return (
    <div ref={sectionRef} className="overflow-hidden py-16">
      <div ref={trackRef} className="flex w-max items-center gap-10 will-change-transform">
        {sequence.map((Icon, i) => (
          <div
            key={i}
            ref={(el) => {
              if (el) iconEls.current[i] = el;
            }}
            className="flex size-24 shrink-0 items-center justify-center rounded-full border border-stroke bg-white text-black shadow-solid-2 dark:border-strokedark dark:bg-blacksection dark:text-white"
          >
            <Icon className="text-primary size-9" />
          </div>
        ))}
      </div>
    </div>
  );
}
