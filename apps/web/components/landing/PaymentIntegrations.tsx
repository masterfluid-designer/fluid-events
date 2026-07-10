"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import SectionHeader from "@/components/landing/SectionHeader";

const integrationSlots = [
  { type: "logo", name: "Kkiapay", src: "/images/partenaire-logo/kkiapay-logo.png" },
  { type: "empty" },
  { type: "logo", name: "CinetPay", src: "/images/partenaire-logo/cinetpay-logo.jpg" },
  { type: "dot", className: "h-[11px] w-[11px] bg-[#FFDB26]" },
  { type: "logo", name: "FedaPay", src: "/images/partenaire-logo/fedapay-logo.jpg" },
  { type: "empty" },
  { type: "dot", className: "h-[15px] w-[15px] bg-[#62E888]" },
  { type: "logo", name: "Orange Money", src: "/images/partenaire-logo/Orange-Money-logo.png" },
  { type: "dot", className: "h-[23px] w-[23px] bg-[#EF5C00]" },
  { type: "logo", name: "Moov Money", src: "/images/partenaire-logo/Moov_Money_Flooz-logo.png" },
  { type: "dot", className: "h-[15px] w-[15px] bg-[#016BFF]" },
  { type: "logo", name: "Mastercard", src: "/images/partenaire-logo/Mastercard-logo.webp" },
];

export default function PaymentIntegrations() {
  return (
    <section id="payments" className="py-20 lg:py-25 xl:py-30">
      <div className="mx-auto max-w-c-1390 px-4 md:px-8 2xl:px-0">
        <SectionHeader
          headerInfo={{
            title: "PAIEMENTS",
            subtitle: "Encaissez avec les moyens que vos participants utilisent déjà",
            description:
              "Connectez vos billets aux providers locaux et laissez Fluid Events préparer automatiquement confirmation, reçu et QR code après paiement.",
          }}
        />
      </div>

      <div className="relative z-50 mx-auto mt-15 max-w-c-1154 px-4 md:px-8 xl:mt-20 xl:px-0">
        <div className="absolute -top-3/4 left-0 right-0 -z-1 mx-auto h-full w-full">
          <Image
            width={1200}
            height={400}
            sizes="(max-width: 768px) 100vw"
            src="/images/shape/shape-dotted-light.svg"
            alt=""
            className="dark:hidden"
            style={{ position: "static" }}
          />
          <Image
            fill
            src="/images/shape/shape-dotted-dark.svg"
            alt=""
            className="hidden dark:block"
          />
        </div>

        <div className="flex flex-wrap justify-around gap-y-10">
          {integrationSlots.map((slot, index) => (
            <motion.div
              key={`${slot.type}-${index}`}
              variants={{
                hidden: { opacity: 0, y: -20 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              transition={{ duration: 1, delay: 0.1 }}
              viewport={{ once: true }}
              className="animate_top flex w-1/3 justify-center sm:w-1/4 lg:w-1/6"
            >
              {slot.type === "logo" && slot.src ? (
                <div className="inline-flex h-22 w-22 items-center justify-center rounded-[10px] bg-white p-4 shadow-solid-7 dark:bg-btndark">
                  <Image
                    width={64}
                    height={64}
                    src={slot.src}
                    alt={slot.name ?? ""}
                    className="max-h-14 w-auto object-contain"
                  />
                </div>
              ) : slot.type === "dot" ? (
                <div className={`mt-8 rounded-full ${slot.className}`} />
              ) : (
                <div className="h-22 w-22" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
