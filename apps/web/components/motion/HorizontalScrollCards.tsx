"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

export interface HorizontalCardItem {
  id: string;
  caption: React.ReactNode;
  content: React.ReactNode;
}

interface HorizontalScrollCardsProps {
  items: HorizontalCardItem[];
  cardWidthClass?: string;
  /** false pour des cartes autonomes (image+titre+lien déjà dans `content`) sans légende synchronisée. */
  showCaption?: boolean;
  /** Rendu au-dessus des cartes, à l'intérieur du même bloc épinglé/centré. */
  header?: React.ReactNode;
}

export default function HorizontalScrollCards({
  items,
  cardWidthClass = "w-[82vw] max-w-[440px]",
  showCaption = true,
  header,
}: HorizontalScrollCardsProps) {
  // sectionRef = déclencheur du pin, occupe tout le viewport (min-h-svh) :
  // le bloc entier (titre + cartes + légende) reste donc centré à l'écran
  // pendant tout le défilement horizontal, au lieu de se coller en haut.
  const sectionRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const track = trackRef.current;
      const viewport = viewportRef.current;
      const section = sectionRef.current;
      if (!track || !viewport || !section) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      const tween = gsap.to(track, {
        x: () => -(track.scrollWidth - viewport.clientWidth),
        ease: "none",
      });

      const st = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: () => `+=${track.scrollWidth - viewport.clientWidth}`,
        pin: true,
        animation: tween,
        scrub: 0.8,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          setActive(Math.round(self.progress * (items.length - 1)));
        },
      });
      triggerRef.current = st;

      return () => {
        st.kill();
        triggerRef.current = null;
      };
    },
    { scope: sectionRef, dependencies: [items.length] },
  );

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    const st = triggerRef.current;
    if (!st) return;
    const targetScroll = st.start + (clamped / (items.length - 1)) * (st.end - st.start);
    window.scrollTo({ top: targetScroll, behavior: "smooth" });
  }

  return (
    <div
      ref={sectionRef}
      className="flex min-h-svh flex-col items-center justify-center gap-10 py-16"
    >
      <div className="mx-auto w-full max-w-[1600px] px-6 md:px-12">{header}</div>
      {/* Pas de padding/max-w à droite ici : le rail déborde jusqu'au bord
          réel du viewport et la carte suivante y est visiblement coupée par
          l'overflow-hidden (effet "il y a plus à voir"), au lieu d'être
          proprement contenue dans une colonne centrée — seul cet élément
          (celui qui défile horizontalement) reste en plein écran. */}
      <div ref={viewportRef} className="relative w-full overflow-hidden pl-6 md:pl-12">
        <div ref={trackRef} className="flex gap-6 will-change-transform">
          {items.map((item) => (
            <div key={item.id} className={`shrink-0 ${cardWidthClass}`}>
              {item.content}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-6 px-6 md:px-12">
        <div className="min-w-0">{showCaption && items[active]?.caption}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="précédent"
            onClick={() => goTo(active - 1)}
            className="flex size-9 items-center justify-center rounded-full border border-stroke text-black transition hover:border-primary hover:text-primary dark:border-strokedark dark:text-white"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="suivant"
            onClick={() => goTo(active + 1)}
            className="flex size-9 items-center justify-center rounded-full border border-stroke text-black transition hover:border-primary hover:text-primary dark:border-strokedark dark:text-white"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
