"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const stats = [
  { value: "< 500ms", label: "Validation QR" },
  { value: "3+", label: "Providers paiement" },
  { value: "24/7", label: "Support événement" },
];

export default function FunFact() {
  return (
    <section className="px-4 py-20 md:px-8 lg:py-22.5 2xl:px-0">
      <div className="relative z-1 mx-auto max-w-c-1390 rounded-lg bg-linear-to-t from-[#F8F9FF] to-[#DEE7FF] py-22.5 dark:bg-blacksection dark:bg-linear-to-t dark:from-transparent dark:to-transparent xl:py-27.5">
        <Image
          width={335}
          height={384}
          src="/images/shape/shape-04.png"
          alt=""
          className="absolute -left-15 -top-25 -z-1 lg:left-0"
        />
        <Image
          width={132}
          height={132}
          src="/images/shape/shape-05.png"
          alt=""
          className="absolute bottom-0 right-0 -z-1"
        />
        <Image
          fill
          src="/images/shape/shape-dotted-light-02.svg"
          alt=""
          className="absolute left-0 top-0 -z-1 dark:hidden"
        />
        <Image
          fill
          src="/images/shape/shape-dotted-dark-02.svg"
          alt=""
          className="absolute left-0 top-0 -z-1 hidden dark:block"
        />

        <motion.div
          variants={{
            hidden: { opacity: 0, y: -20 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          whileInView="visible"
          transition={{ duration: 1, delay: 0.1 }}
          viewport={{ once: true }}
          className="animate_top mx-auto mb-12.5 px-4 text-center md:w-4/5 md:px-0 lg:mb-17.5 lg:w-2/3 xl:w-1/2"
        >
          <h2 className="mb-4 text-3xl font-bold text-black dark:text-white xl:text-sectiontitle3">
            Conçu pour les événements où chaque entrée compte.
          </h2>
          <p className="mx-auto lg:w-11/12">
            De la vente au contrôle d'accès, chaque étape reste rapide,
            traçable et adaptée aux habitudes de paiement locales.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-8 lg:gap-42.5">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              variants={{
                hidden: { opacity: 0, y: -20 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              transition={{ duration: 1, delay: 0.4 + index * 0.15 }}
              viewport={{ once: true }}
              className="animate_top text-center"
            >
              <h3 className="mb-2.5 text-3xl font-bold text-black dark:text-white xl:text-sectiontitle3">
                {stat.value}
              </h3>
              <p className="text-lg lg:text-para2">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
