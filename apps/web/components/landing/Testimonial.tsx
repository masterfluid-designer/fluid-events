"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import SectionHeader from "@/components/landing/SectionHeader";

const testimonials = [
  {
    name: "Aminata Koné",
    role: "Organisatrice de conférences",
    avatar: "/images/user/user-01.png",
    quote:
      "La vente Mobile Money et le scan QR nous ont permis de réduire la file d'attente à l'entrée. L'équipe avait tout depuis le dashboard.",
  },
  {
    name: "David Mensah",
    role: "Manager événementiel",
    avatar: "/images/user/user-02.png",
    quote:
      "On a lancé la billetterie en quelques minutes, puis suivi les paiements et les validations en direct le jour de l'événement.",
  },
];

export default function Testimonial() {
  return (
    <section className="py-20 lg:py-25 xl:py-30">
      <div className="mx-auto max-w-c-1315 px-4 md:px-8 xl:px-0">
        <SectionHeader
          headerInfo={{
            title: "TÉMOIGNAGES",
            subtitle: "Ce que les organisateurs apprécient",
            description:
              "Fluid Events est pensé pour les équipes qui veulent vendre vite, encaisser localement et contrôler l'accès avec confiance.",
          }}
        />

        <div className="mt-12.5 grid gap-7.5 md:grid-cols-2 lg:mt-15 xl:mt-20 xl:gap-12.5">
          {testimonials.map((item, index) => (
            <motion.div
              key={item.name}
              variants={{
                hidden: { opacity: 0, y: -20 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              transition={{ duration: 1, delay: 0.1 + index * 0.1 }}
              viewport={{ once: true }}
              className="animate_top rounded-lg border border-stroke bg-white p-7.5 shadow-solid-10 dark:border-strokedark dark:bg-blacksection xl:p-10"
            >
              <div className="mb-6 flex items-center gap-4">
                <Image
                  src={item.avatar}
                  alt={item.name}
                  width={56}
                  height={56}
                  className="rounded-full"
                />
                <div>
                  <h3 className="text-metatitle2 font-semibold text-black dark:text-white">
                    {item.name}
                  </h3>
                  <p className="text-metatitle text-waterloo dark:text-manatee">
                    {item.role}
                  </p>
                </div>
              </div>
              <p>{item.quote}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
