"use client";

import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import ParticleField from "@/components/motion/ParticleField";
import ScrollReveal from "@/components/motion/ScrollReveal";
import Typewriter from "@/components/motion/Typewriter";
import { darkCtaContent } from "@/lib/content/landing/cta";

export default function DarkCta() {
  const boxRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!boxRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    // Même logique que le stage produit : la boîte grossit progressivement
    // jusqu'à sa taille normale à mesure qu'elle entre dans le viewport.
    gsap.fromTo(
      boxRef.current,
      { scale: 0.7, opacity: 0.5 },
      {
        scale: 1,
        opacity: 1,
        ease: "none",
        scrollTrigger: {
          trigger: boxRef.current,
          start: "top bottom",
          end: "top 55%",
          scrub: true,
        },
      },
    );
  }, { scope: boxRef });

  return (
    <div className="mx-4 my-10 md:mx-8 2xl:mx-auto 2xl:max-w-[1800px]">
      <section
        ref={boxRef}
        className="relative overflow-hidden rounded-3xl bg-black py-28 md:py-36 dark:bg-blackho"
      >
        <ParticleField className="opacity-70" />
        <ScrollReveal className="relative mx-auto max-w-[900px] px-6 text-center">
          <h2 className="font-space-grotesk mb-6 text-3xl font-medium text-white md:text-5xl">
            <Typewriter once segments={[{ text: darkCtaContent.title }]} />
          </h2>
          <p className="mx-auto mb-10 max-w-lg text-regular text-white/60">
            {darkCtaContent.subtitle}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              className="group inline-flex items-center gap-2.5 rounded-full bg-white px-8 py-3 text-black duration-300 ease-in-out hover:bg-white/90"
            >
              {darkCtaContent.ctaPrimaryLabel}
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2.5 rounded-full border border-white/20 px-8 py-3 text-white duration-300 ease-in-out hover:border-white/40"
            >
              {darkCtaContent.ctaSecondaryLabel}
            </button>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
