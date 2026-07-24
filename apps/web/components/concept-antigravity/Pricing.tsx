"use client";

import { Check } from "lucide-react";
import ScrollReveal from "@/components/motion/ScrollReveal";
import Typewriter from "@/components/motion/Typewriter";
import { pricingContent } from "@/lib/content/landing/pricing";

const PLANS = pricingContent.plans;

export default function Pricing() {
  return (
    <section
      id="pricing"
      className="flex min-h-svh flex-col items-center justify-center gap-16 bg-alabaster px-4 py-24 md:px-8 dark:bg-black"
    >
      <ScrollReveal className="max-w-2xl text-center" y={30}>
        <h2 className="font-space-grotesk text-5xl font-bold uppercase tracking-tight text-black md:text-7xl dark:text-white">
          <Typewriter once segments={[{ text: pricingContent.title }]} />
        </h2>
        <p className="mt-4 text-lg font-semibold text-waterloo dark:text-white/70">
          {pricingContent.subtitle}
        </p>
      </ScrollReveal>

      <div className="grid w-full max-w-[1300px] gap-6 md:grid-cols-2">
        {PLANS.map((plan, i) => (
          <ScrollReveal key={plan.id} y={40} delay={i * 0.1}>
            <div
              className={`flex h-full flex-col rounded-3xl border p-10 shadow-solid-2 md:p-12 ${
                plan.featured
                  ? "border-primary/40 bg-white ring-1 ring-primary/20 dark:border-transparent dark:bg-[#161616] dark:ring-primary/40"
                  : "border-stroke bg-white dark:border-transparent dark:bg-[#111111]"
              }`}
            >
              <h3 className="text-2xl font-semibold text-black dark:text-white">{plan.name}</h3>
              <p className="mt-2 text-regular text-waterloo dark:text-white/50">
                {plan.description}
              </p>

              <div className="mt-10 flex items-baseline gap-2">
                <span className="font-space-grotesk text-6xl font-bold text-black md:text-7xl dark:text-white">
                  {plan.price}
                </span>
                <span className="text-regular font-medium text-waterloo dark:text-white/50">
                  {plan.unit}
                </span>
              </div>

              <div className="my-8 border-t border-stroke dark:border-white/10" />

              <p className="text-regular text-manatee dark:text-white/40">Ce qui est inclus :</p>
              <ul className="mt-5 flex flex-1 flex-col gap-4">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/15">
                      <Check className="size-3.5 text-black dark:text-white" />
                    </span>
                    <span className="text-regular text-waterloo dark:text-white/80">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex items-end justify-between gap-4">
                <div className="text-metatitle text-manatee dark:text-white/40">
                  {plan.timelineLabel} :
                  <br />
                  <span className="text-regular font-medium text-black dark:text-white">
                    {plan.timelineValue}
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-black px-6 py-2.5 text-regular font-medium text-white transition duration-300 ease-in-out hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
