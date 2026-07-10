"use client";

import { motion } from "framer-motion";
import Image from "next/image";

type ContactProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
};

export default function Contact({
  eyebrow = "CONTACT",
  title = "Parlez-nous de votre prochain événement",
  description = "Concert, conférence, festival ou soirée privée : dites-nous ce que vous préparez, nous vous aidons à choisir le bon parcours de billetterie.",
}: ContactProps) {
  return (
    <section id="contact" className="px-4 py-20 md:px-8 lg:py-25 2xl:px-0">
      <div className="relative mx-auto max-w-c-1390 px-7.5 pt-10 lg:px-15 lg:pt-15 xl:px-20 xl:pt-20">
        <div className="absolute left-0 top-0 -z-1 h-2/3 w-full rounded-lg bg-linear-to-t from-transparent to-[#dee7ff47] dark:bg-linear-to-t dark:to-[#252A42]" />
        <div className="absolute bottom-[-255px] left-0 -z-1 h-full w-full">
          <Image
            src="/images/shape/shape-dotted-light.svg"
            alt=""
            className="dark:hidden"
            fill
          />
          <Image
            src="/images/shape/shape-dotted-dark.svg"
            alt=""
            className="hidden dark:block"
            fill
          />
        </div>

        <div className="mb-12 max-w-[720px]">
          <span className="mb-4 inline-flex rounded-full bg-zumthor px-4.5 py-1.5 text-sectiontitle font-medium text-black dark:border dark:border-strokedark dark:bg-blacksection dark:text-white">
            {eyebrow}
          </span>
          <h1 className="text-3xl font-semibold text-black dark:text-white xl:text-sectiontitle2">
            {title}
          </h1>
          <p className="mt-4">{description}</p>
        </div>

        <div className="flex flex-col-reverse flex-wrap gap-8 md:flex-row md:flex-nowrap md:justify-between xl:gap-20">
          <motion.div
            variants={{
              hidden: { opacity: 0, y: -20 },
              visible: { opacity: 1, y: 0 },
            }}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 1, delay: 0.1 }}
            viewport={{ once: true }}
            className="animate_top w-full rounded-lg bg-white p-7.5 shadow-solid-8 dark:border dark:border-strokedark dark:bg-black md:w-3/5 lg:w-3/4 xl:p-15"
          >
            <h2 className="mb-15 text-3xl font-semibold text-black dark:text-white xl:text-sectiontitle2">
              Envoyer un message
            </h2>

            <form>
              <div className="mb-7.5 flex flex-col gap-7.5 lg:flex-row lg:justify-between lg:gap-14">
                <input
                  type="text"
                  placeholder="Nom complet"
                  className="w-full border-b border-stroke bg-transparent pb-3.5 focus:border-waterloo focus:placeholder:text-black focus-visible:outline-hidden dark:border-strokedark dark:focus:border-manatee dark:focus:placeholder:text-white lg:w-1/2"
                />
                <input
                  type="email"
                  placeholder="Adresse email"
                  className="w-full border-b border-stroke bg-transparent pb-3.5 focus:border-waterloo focus:placeholder:text-black focus-visible:outline-hidden dark:border-strokedark dark:focus:border-manatee dark:focus:placeholder:text-white lg:w-1/2"
                />
              </div>

              <div className="mb-12.5 flex flex-col gap-7.5 lg:flex-row lg:justify-between lg:gap-14">
                <input
                  type="text"
                  placeholder="Sujet"
                  className="w-full border-b border-stroke bg-transparent pb-3.5 focus:border-waterloo focus:placeholder:text-black focus-visible:outline-hidden dark:border-strokedark dark:focus:border-manatee dark:focus:placeholder:text-white lg:w-1/2"
                />
                <input
                  type="text"
                  placeholder="Téléphone"
                  className="w-full border-b border-stroke bg-transparent pb-3.5 focus:border-waterloo focus:placeholder:text-black focus-visible:outline-hidden dark:border-strokedark dark:focus:border-manatee dark:focus:placeholder:text-white lg:w-1/2"
                />
              </div>

              <div className="mb-11.5 flex">
                <textarea
                  placeholder="Message"
                  rows={4}
                  className="w-full border-b border-stroke bg-transparent focus:border-waterloo focus:placeholder:text-black focus-visible:outline-hidden dark:border-strokedark dark:focus:border-manatee dark:focus:placeholder:text-white"
                />
              </div>

              <div className="flex flex-wrap gap-4 xl:justify-between">
                <p className="max-w-[425px] text-metatitle text-waterloo dark:text-manatee">
                  En envoyant ce message, vous acceptez d'être recontacté au
                  sujet de Fluid Events.
                </p>
                <button
                  type="button"
                  aria-label="send message"
                  className="inline-flex items-center gap-2.5 rounded-full bg-black px-6 py-3 font-medium text-white duration-300 ease-in-out hover:bg-blackho dark:bg-btndark"
                >
                  Envoyer
                  <svg className="fill-white" width="14" height="14" viewBox="0 0 14 14">
                    <path d="M10.4767 6.16664L6.00668 1.69664L7.18501 0.518311L13.6667 6.99998L7.18501 13.4816L6.00668 12.3033L10.4767 7.83331H0.333344V6.16664H10.4767Z" />
                  </svg>
                </button>
              </div>
            </form>
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: -20 },
              visible: { opacity: 1, y: 0 },
            }}
            initial="hidden"
            whileInView="visible"
            transition={{ duration: 1.2, delay: 0.1 }}
            viewport={{ once: true }}
            className="animate_top w-full md:w-2/5 md:p-7.5 lg:w-[26%] xl:pt-15"
          >
            <h2 className="mb-12.5 text-3xl font-semibold text-black dark:text-white xl:text-sectiontitle2">
              Nous trouver
            </h2>

            <div className="mb-7">
              <h3 className="mb-4 text-metatitle3 font-medium text-black dark:text-white">
                Localisation
              </h3>
              <p>Abidjan, Côte d'Ivoire</p>
            </div>
            <div className="mb-7">
              <h3 className="mb-4 text-metatitle3 font-medium text-black dark:text-white">
                Email
              </h3>
              <p>
                <a href="mailto:hello@fluidevents.africa">hello@fluidevents.africa</a>
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-metatitle3 font-medium text-black dark:text-white">
                Besoin rapide ?
              </h4>
              <p>Support organisateur, onboarding paiement et accompagnement scanner.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
