"use client";

import { ArrowRight, CreditCard, QrCode, BarChart3, Palette, Rocket } from "lucide-react";
import HorizontalScrollCards, {
  type HorizontalCardItem,
} from "@/components/motion/HorizontalScrollCards";
import Typewriter from "@/components/motion/Typewriter";

const POSTS = [
  {
    id: "paiements-unifies",
    icon: CreditCard,
    gradient: "from-primary via-orange-500 to-amber-400",
    category: "Produit",
    date: "21 juil. 2026",
    title: "Kkiapay, CinetPay, FedaPay : trois moyens d'encaissement, un seul flux",
  },
  {
    id: "digital-africa-summit",
    icon: Rocket,
    gradient: "from-sky-500 via-blue-600 to-indigo-600",
    category: "Événement",
    date: "14 juil. 2026",
    title: "Fluid Events au Digital Africa Summit 2026",
  },
  {
    id: "dashboard-analytics",
    icon: BarChart3,
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    category: "Produit",
    date: "3 juil. 2026",
    title: "Nouveau : dashboard analytics en temps réel",
  },
  {
    id: "guide-no-code",
    icon: Palette,
    gradient: "from-fuchsia-500 via-purple-500 to-violet-600",
    category: "Guide",
    date: "26 juin 2026",
    title: "Composer votre première page événement en no-code",
  },
  {
    id: "scanner-rapide",
    icon: QrCode,
    gradient: "from-rose-500 via-red-500 to-orange-500",
    category: "Produit",
    date: "18 juin 2026",
    title: "Scanner PWA : valider 500 billets en moins d'une minute",
  },
];

export default function BlogCarousel() {
  const items: HorizontalCardItem[] = POSTS.map((post) => {
    const Icon = post.icon;
    return {
      id: post.id,
      caption: null,
      content: (
        <a href="#" className="group block">
          <div
            className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-linear-to-br ${post.gradient}`}
          >
            <Icon className="size-20 text-white/90" strokeWidth={1.5} />
          </div>
          <div className="mt-4">
            <h4 className="font-space-grotesk text-itemtitle2 font-semibold text-black transition-colors group-hover:text-primary dark:text-white">
              {post.title}
            </h4>
            <p className="mt-2 text-metatitle text-manatee dark:text-waterloo">
              {post.date} · {post.category}
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-metatitle font-medium text-primary">
              Lire l&rsquo;article
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </a>
      ),
    };
  });

  return (
    <HorizontalScrollCards
      items={items}
      cardWidthClass="w-[70vw] max-w-[320px]"
      showCaption={false}
      header={
        <div className="flex w-full flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-accent-terracotta dark:text-accent-terracotta-dark text-sectiontitle font-bold uppercase tracking-[0.06em]">
              Blog
            </span>
            <h2 className="font-space-grotesk mt-3 max-w-xl text-3xl font-medium text-black md:text-5xl dark:text-white">
              <Typewriter once segments={[{ text: "Dernières actualités" }]} />
            </h2>
          </div>
          <a
            href="#"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-stroke px-5 py-2.5 text-regular font-medium text-black transition duration-300 ease-in-out hover:border-primary hover:text-primary dark:border-strokedark dark:text-white"
          >
            Voir plus de blog
            <ArrowRight className="size-4" />
          </a>
        </div>
      }
    />
  );
}
