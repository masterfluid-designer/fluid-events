"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import Typewriter from "@/components/motion/Typewriter";
import type { TrustedLogo } from "@/lib/trusted-logos.server";
import { trustedContent } from "@/lib/content/landing/trusted";

interface TrustedByCarouselProps {
  /** Lu côté serveur depuis GET /api/storage/media-folders/trusted-logos. */
  logos: TrustedLogo[];
}

/** Durée d'un tour complet (vitesse de base, avant tout boost au scroll). */
const BASE_DURATION = 32;
/** Multiplicateur de vitesse max atteignable pendant un scroll rapide. */
const MAX_SCROLL_BOOST = 6;
/** Vitesse à laquelle le boost retombe à 1x une fois le scroll arrêté (par frame). */
const BOOST_DECAY = 0.06;

function LogoTile({ logo }: { logo: TrustedLogo }) {
  return (
    <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl bg-white p-5 sm:size-28 dark:bg-blacksection">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.url} alt="" className="max-h-full w-auto object-contain grayscale" />
    </div>
  );
}

export default function TrustedByCarousel({ logos }: TrustedByCarouselProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const row1Ref = useRef<HTMLDivElement>(null);
  const row2Ref = useRef<HTMLDivElement>(null);

  // "Un tour" = assez de logos pour dépasser largement la largeur du
  // viewport, dupliqué une fois — le tour fait alors exactement 50% de la
  // largeur totale du rail, ce qui permet une boucle infinie parfaitement
  // continue (xPercent 0 → -50 revient pile sur la même image visuelle).
  const repeatCount = logos.length > 0 ? Math.max(3, Math.ceil(14 / logos.length)) : 0;
  const lap = Array.from({ length: repeatCount }, () => logos).flat();
  const lapReversed = [...lap].reverse();
  const row1 = [...lap, ...lap];
  const row2 = [...lapReversed, ...lapReversed];

  useGSAP(
    () => {
      const el1 = row1Ref.current;
      const el2 = row2Ref.current;
      if (!el1 || !el2 || lap.length === 0) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      // Défilement infini : chaque ligne boucle en continu, en sens inverse
      // l'une de l'autre. gsap.fromTo + repeat:-1 revient instantanément au
      // point de départ à chaque tour — invisible puisque le contenu est
      // dupliqué (0% et -50% affichent exactement la même image).
      const tweenA = gsap.fromTo(
        el1,
        { xPercent: 0 },
        { xPercent: -50, duration: BASE_DURATION, ease: "none", repeat: -1 },
      );
      const tweenB = gsap.fromTo(
        el2,
        { xPercent: -50 },
        { xPercent: 0, duration: BASE_DURATION, ease: "none", repeat: -1 },
      );

      // Accélère temporairement les deux boucles à la vitesse du scroll —
      // plus on scrolle vite, plus le défilement s'emballe, puis retombe en
      // douceur à sa vitesse de croisière une fois le scroll arrêté.
      let lastY = window.scrollY;
      let boost = 1;

      function handleScroll() {
        const y = window.scrollY;
        const delta = Math.abs(y - lastY);
        lastY = y;
        boost = Math.max(boost, 1 + Math.min(delta / 6, MAX_SCROLL_BOOST));
      }
      window.addEventListener("scroll", handleScroll, { passive: true });

      function tick() {
        boost += (1 - boost) * BOOST_DECAY;
        tweenA.timeScale(boost);
        tweenB.timeScale(boost);
      }
      gsap.ticker.add(tick);

      return () => {
        window.removeEventListener("scroll", handleScroll);
        gsap.ticker.remove(tick);
      };
    },
    { scope: sectionRef, dependencies: [lap.length] },
  );

  if (logos.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      className="flex flex-col items-center justify-center gap-10 py-16 md:py-20"
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-6 md:px-12">
        <div className="text-left">
          <span className="text-accent-terracotta dark:text-accent-terracotta-dark text-sectiontitle font-bold uppercase tracking-[0.06em]">
            {trustedContent.eyebrow}
          </span>
          <h2 className="font-space-grotesk mt-3 max-w-xl text-3xl font-medium text-black md:text-5xl dark:text-white">
            <Typewriter once segments={[{ text: trustedContent.title }]} />
          </h2>
        </div>

        <div className="flex w-full flex-col gap-6">
          <div className="relative w-full overflow-hidden">
            <div ref={row1Ref} className="flex w-max gap-6 will-change-transform">
              {row1.map((logo, i) => (
                <LogoTile key={`${logo.key}-a-${i}`} logo={logo} />
              ))}
            </div>
          </div>
          <div className="relative w-full overflow-hidden">
            <div ref={row2Ref} className="flex w-max gap-6 will-change-transform">
              {row2.map((logo, i) => (
                <LogoTile key={`${logo.key}-b-${i}`} logo={logo} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
