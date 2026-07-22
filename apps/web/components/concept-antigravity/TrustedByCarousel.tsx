"use client";

import HorizontalScrollCards, {
  type HorizontalCardItem,
} from "@/components/motion/HorizontalScrollCards";
import Typewriter from "@/components/motion/Typewriter";

// Noms/logos fictifs — aucun événement ni marque réels.
const CLIENTS = [
  { id: "abidjan-music-week", name: "Abidjan Music Week", font: "font-space-grotesk", tone: "text-black dark:text-white" },
  { id: "festival-awa", name: "Festival Awa", font: "font-serif italic", tone: "text-accent-terracotta dark:text-accent-terracotta-dark" },
  { id: "cine-plein-air", name: "Ciné Plein Air CI", font: "font-space-grotesk uppercase tracking-wide", tone: "text-black dark:text-white" },
  { id: "lagos-tech-summit", name: "Lagos Tech Summit", font: "font-sans font-black", tone: "text-black dark:text-white" },
  { id: "dakar-fashion-days", name: "Dakar Fashion Days", font: "font-serif", tone: "text-black dark:text-white" },
  { id: "accra-food-fest", name: "Accra Food Fest", font: "font-space-grotesk", tone: "text-accent-terracotta dark:text-accent-terracotta-dark" },
  { id: "bamako-jazz-nights", name: "Bamako Jazz Nights", font: "font-serif italic", tone: "text-black dark:text-white" },
  { id: "cotonou-sports-expo", name: "Cotonou Sports Expo", font: "font-sans font-extrabold uppercase tracking-wide", tone: "text-black dark:text-white" },
];

export default function TrustedByCarousel() {
  const items: HorizontalCardItem[] = CLIENTS.map((client) => ({
    id: client.id,
    caption: (
      <div>
        <h4 className="text-itemtitle2 font-semibold text-black dark:text-white">
          {client.name}
        </h4>
      </div>
    ),
    content: (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-6 rounded-2xl border border-stroke bg-white p-8 shadow-solid-l dark:border-strokedark dark:bg-blacksection">
        <p className={`text-center text-xl leading-tight ${client.font} ${client.tone}`}>
          {client.name}
        </p>
      </div>
    ),
  }));

  return (
    <HorizontalScrollCards
      items={items}
      cardWidthClass="w-[70vw] max-w-[360px]"
      header={
        <div className="w-full text-left">
          <span className="text-accent-terracotta dark:text-accent-terracotta-dark text-sectiontitle font-bold uppercase tracking-[0.06em]">
            Ils nous font confiance
          </span>
          <h2 className="font-space-grotesk mt-3 max-w-xl text-3xl font-medium text-black md:text-5xl dark:text-white">
            <Typewriter
              once
              segments={[{ text: "Des organisateurs qui nous confient leurs événements" }]}
            />
          </h2>
        </div>
      }
    />
  );
}
