"use client";

import { useRef } from "react";
import { ArrowRight, PlayCircle, Ticket } from "lucide-react";
import Typewriter from "@/components/motion/Typewriter";
import { heroContent } from "@/lib/content/landing/hero";

export default function ConceptHero() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-svh items-center justify-center overflow-hidden pt-24"
    >
      <div className="relative mx-auto w-full max-w-[1600px] px-6 text-center md:px-12">
        <div className="mb-6 flex items-center justify-center gap-2 text-itemtitle2 font-medium text-black dark:text-white">
          <Ticket className="text-primary size-7" />
          Fluid Events
        </div>

        <h1 className="font-space-grotesk mx-auto mb-6 max-w-[1500px] text-6xl font-semibold leading-[1.0] tracking-tight text-black dark:text-white md:text-8xl xl:text-[96px]">
          <Typewriter
            triggerRef={sectionRef}
            segments={[{ text: heroContent.title }]}
          />
        </h1>

        <p className="mx-auto max-w-[640px] text-regular text-waterloo dark:text-manatee">
          {heroContent.subtitle}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            type="button"
            className="group inline-flex items-center gap-2.5 rounded-full bg-black px-8 py-3 text-white duration-300 ease-in-out hover:bg-blackho dark:bg-btndark dark:hover:bg-blackho"
          >
            {heroContent.ctaPrimaryLabel}
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2.5 rounded-full border border-stroke bg-white px-8 py-3 text-black duration-300 ease-in-out hover:border-primary hover:text-primary dark:border-strokedark dark:bg-blacksection dark:text-white dark:hover:border-primary dark:hover:text-primary"
          >
            <PlayCircle className="size-4" />
            {heroContent.ctaSecondaryLabel}
          </button>
        </div>

        <p className="mt-5 text-metatitle text-manatee dark:text-waterloo">
          {heroContent.footnote}
        </p>
      </div>
    </section>
  );
}
