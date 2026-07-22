"use client";

import { PartyPopper, ScanLine, Ticket } from "lucide-react";
import HorizontalScrollCards, {
  type HorizontalCardItem,
} from "@/components/motion/HorizontalScrollCards";
import Typewriter from "@/components/motion/Typewriter";

const ROLES = [
  {
    id: "organisateur",
    icon: PartyPopper,
    title: "Organisateur",
    description:
      "Créez votre événement, composez votre page en no-code et encaissez en Mobile Money dès la première vente.",
    gradient: "from-primary/30 to-transparent",
  },
  {
    id: "scanner",
    icon: ScanLine,
    title: "Agent scanner",
    description:
      "Validez les entrées avec n'importe quel téléphone. Fonctionne hors ligne, aucune formation nécessaire.",
    gradient: "from-emerald-500/30 to-transparent",
  },
  {
    id: "client",
    icon: Ticket,
    title: "Client",
    description:
      "Achetez en Mobile Money, recevez votre billet QR instantanément par email ou WhatsApp.",
    gradient: "from-sky-500/30 to-transparent",
  },
] satisfies Array<{
  id: string;
  icon: typeof PartyPopper;
  title: string;
  description: string;
  gradient: string;
}>;

export default function RolesCarousel() {
  const items: HorizontalCardItem[] = ROLES.map((role) => {
    const Icon = role.icon;
    return {
      id: role.id,
      caption: (
        <div>
          <h4 className="text-itemtitle2 font-semibold text-black dark:text-white">
            {role.title}
          </h4>
          <p className="mt-1 max-w-md text-regular text-waterloo dark:text-manatee">
            {role.description}
          </p>
        </div>
      ),
      content: (
        <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-blacksection shadow-solid-l">
          <div className={`absolute inset-0 bg-linear-to-br ${role.gradient}`} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-24 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <Icon className="size-11 text-white" />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-6 pt-16">
            <h4 className="text-itemtitle2 font-semibold text-white">{role.title}</h4>
          </div>
        </div>
      ),
    };
  });

  return (
    <HorizontalScrollCards
      items={items}
      cardWidthClass="w-[85vw] max-w-[640px]"
      header={
        <div className="w-full text-left">
          <span className="text-accent-terracotta dark:text-accent-terracotta-dark text-sectiontitle font-bold uppercase tracking-[0.06em]">
            Pensé pour chaque rôle
          </span>
          <h2 className="font-space-grotesk mt-3 max-w-xl text-3xl font-medium text-black md:text-5xl dark:text-white">
            <Typewriter once segments={[{ text: "Une expérience pensée pour chacun" }]} />
          </h2>
        </div>
      }
    />
  );
}
