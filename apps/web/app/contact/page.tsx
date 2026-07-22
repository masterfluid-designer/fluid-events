import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Lines from "@/components/Lines";
import Contact from "@/components/landing/Contact";

export const metadata: Metadata = {
  title: "Contact — Fluid Events",
  description:
    "Contactez Fluid Events pour préparer votre billetterie, vos paiements Mobile Money et votre contrôle d'accès.",
};

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden">
        <Lines />
        <Contact />
      </main>
      <Footer />
    </>
  );
}