"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

const tabs = [
  {
    id: "tabOne",
    label: "Interface organisateur",
    title: "Un dashboard clair pour suivre ventes, billets et entrées.",
    description:
      "Les organisateurs gardent une vue simple sur les tickets vendus, les revenus, les scanners actifs et les paiements confirmés.",
    bullets:
      "Suivi temps réel des ventes, participants et validations QR depuis une interface pensée pour l'exploitation événementielle.",
    light: "/images/features/features-light-01.png",
    dark: "/images/features/features-dark-01.svg",
  },
  {
    id: "tabTwo",
    label: "Pages événement",
    title: "Des pages de vente prêtes pour concerts, conférences et festivals.",
    description:
      "Créez une page publique sans code avec sections, tickets, informations pratiques et appels à l'achat adaptés au mobile.",
    bullets:
      "Hero, description, galerie, tarifs, FAQ et bouton d'achat sont structurés pour convertir rapidement vos visiteurs.",
    light: "/images/hero/hero-light.svg",
    dark: "/images/hero/hero-dark.svg",
  },
  {
    id: "tabThree",
    label: "Paiements & scan",
    title: "Paiement confirmé, QR généré, entrée contrôlée.",
    description:
      "Fluid Events connecte Mobile Money et carte bancaire à un parcours QR sécurisé pour limiter la fraude à l'entrée.",
    bullets:
      "Après paiement, le billet est préparé automatiquement et le scanner PWA peut vérifier l'accès depuis un téléphone.",
    light: "/images/about/about-light-02.svg",
    dark: "/images/about/about-dark-02.svg",
  },
];

export default function FeaturesTab() {
  const [currentTab, setCurrentTab] = useState("tabOne");
  const activeTab = tabs.find((tab) => tab.id === currentTab) ?? tabs[0];

  return (
    <section className="relative pb-20 pt-18.5 lg:pb-22.5">
      <div className="relative mx-auto max-w-c-1390 px-4 md:px-8 2xl:px-0">
        <div className="absolute -top-16 -z-1 mx-auto h-[350px] w-[90%]">
          <Image
            fill
            className="dark:hidden"
            src="/images/shape/shape-dotted-light.svg"
            alt=""
          />
          <Image
            fill
            className="hidden dark:block"
            src="/images/shape/shape-dotted-dark.svg"
            alt=""
          />
        </div>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: -20 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5, delay: 0.1 }}
          viewport={{ once: true }}
          className="animate_top mb-15 flex flex-wrap justify-center rounded-[10px] border border-stroke bg-white shadow-solid-5 dark:border-strokedark dark:bg-blacksection dark:shadow-solid-6 md:flex-nowrap md:items-center lg:gap-7.5 xl:mb-21.5 xl:gap-12.5"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCurrentTab(tab.id)}
              className={`relative flex w-full cursor-pointer items-center gap-4 border-b border-stroke px-6 py-2 text-left last:border-0 dark:border-strokedark md:w-auto md:border-0 xl:px-13.5 xl:py-5 ${
                currentTab === tab.id
                  ? "before:absolute before:bottom-0 before:left-0 before:h-1 before:w-full before:rounded-tl-[4px] before:rounded-tr-[4px] before:bg-primary"
                  : ""
              }`}
            >
              <span className="flex h-12.5 w-12.5 items-center justify-center rounded-[50%] border border-stroke dark:border-strokedark dark:bg-blacksection">
                <span className="text-metatitle3 font-medium text-black dark:text-white">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </span>
              <span className="text-sm font-medium text-black dark:text-white xl:text-regular">
                {tab.label}
              </span>
            </button>
          ))}
        </motion.div>

        <motion.div
          key={activeTab.id}
          variants={{
            hidden: { opacity: 0, y: -20 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 0.5, delay: 0.1 }}
          viewport={{ once: true }}
          className="animate_top mx-auto max-w-c-1154"
        >
          <div className="flex items-center gap-8 lg:gap-19">
            <div className="md:w-1/2">
              <h2 className="mb-7 text-3xl font-bold text-black dark:text-white xl:text-sectiontitle2">
                {activeTab.title}
              </h2>
              <p className="mb-5">{activeTab.description}</p>
              <p>{activeTab.bullets}</p>
            </div>

            <div className="relative mx-auto hidden aspect-[562/366] max-w-[550px] md:block md:w-1/2">
              <Image
                src={activeTab.light}
                alt={activeTab.title}
                fill
                className="rounded-lg object-contain shadow-solid-7 dark:hidden"
              />
              <Image
                src={activeTab.dark}
                alt={activeTab.title}
                fill
                className="hidden rounded-lg object-contain shadow-solid-7 dark:block"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
