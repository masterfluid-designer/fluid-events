import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Lines from "@/components/Lines";
import Contact from "@/components/landing/Contact";

export const metadata: Metadata = {
  title: "Support — Fluid Events",
  description:
    "Support organisateur pour Fluid Events : paiement, scanner, QR codes et configuration de vos événements.",
};

export default function SupportPage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden bg-alabaster pb-10 pt-28 dark:bg-black">
        <Lines />
        <Contact
          eyebrow="SUPPORT"
          title="Besoin d'aide sur un événement en cours ?"
          description="Notre support vous accompagne sur la configuration des tickets, les paiements, les accès scanner et les questions avant ouverture des portes."
        />
      </main>
      <Footer />
    </>
  );
}
