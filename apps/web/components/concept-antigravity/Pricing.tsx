"use client";

import { Check } from "lucide-react";
import ScrollReveal from "@/components/motion/ScrollReveal";
import Typewriter from "@/components/motion/Typewriter";

const PLANS = [
  {
    id: "evenement",
    name: "Un événement",
    description:
      "Idéal pour organiser un événement ponctuel, sans engagement ni abonnement.",
    price: "2,5 %",
    unit: "par billet vendu",
    timelineLabel: "Mise en ligne",
    timelineValue: "Immédiate",
    features: [
      "Page événement no-code",
      "Paiement Mobile Money",
      "Scanner PWA illimité",
      "QR codes sécurisés",
      "Support par email",
    ],
    cta: "Créer mon événement",
    featured: false,
  },
  {
    id: "abonnement",
    name: "Abonnement Pro",
    description:
      "Pour les organisateurs réguliers qui veulent plus d'événements et d'analytics.",
    price: "9 900",
    unit: "FCFA / mois",
    timelineLabel: "Engagement",
    timelineValue: "Sans engagement",
    features: [
      "Événements illimités",
      "Tout le plan Un événement",
      "Dashboard analytics avancé",
      "Notifications WhatsApp",
      "Export CSV des participants",
      "Support prioritaire",
    ],
    cta: "S'abonner",
    featured: true,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="flex min-h-svh flex-col items-center justify-center gap-16 bg-black px-4 py-24 md:px-8">
      <ScrollReveal className="max-w-2xl text-center" y={30}>
        <h2 className="font-space-grotesk text-5xl font-bold uppercase tracking-tight text-white md:text-7xl">
          <Typewriter once segments={[{ text: "Tarifs" }]} />
        </h2>
        <p className="mt-4 text-lg font-semibold text-white/70">
          Du premier événement à la programmation régulière.
        </p>
      </ScrollReveal>

      <div className="grid w-full max-w-[1300px] gap-6 md:grid-cols-2">
        {PLANS.map((plan, i) => (
          <ScrollReveal key={plan.id} y={40} delay={i * 0.1}>
            <div
              className={`flex h-full flex-col rounded-3xl p-10 md:p-12 ${
                plan.featured ? "ring-primary/40 bg-[#161616] ring-1" : "bg-[#111111]"
              }`}
            >
              <h3 className="text-2xl font-semibold text-white">{plan.name}</h3>
              <p className="mt-2 text-regular text-white/50">{plan.description}</p>

              <div className="mt-10 flex items-baseline gap-2">
                <span className="font-space-grotesk text-6xl font-bold text-white md:text-7xl">
                  {plan.price}
                </span>
                <span className="text-regular font-medium text-white/50">{plan.unit}</span>
              </div>

              <div className="my-8 border-t border-white/10" />

              <p className="text-regular text-white/40">Ce qui est inclus :</p>
              <ul className="mt-5 flex flex-1 flex-col gap-4">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-white/15">
                      <Check className="size-3.5 text-white" />
                    </span>
                    <span className="text-regular text-white/80">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex items-end justify-between gap-4">
                <div className="text-metatitle text-white/40">
                  {plan.timelineLabel} :
                  <br />
                  <span className="text-regular font-medium text-white">
                    {plan.timelineValue}
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-white px-6 py-2.5 text-regular font-medium text-black transition duration-300 ease-in-out hover:bg-white/90"
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
