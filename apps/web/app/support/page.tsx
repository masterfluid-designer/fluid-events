import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Lines from "@/components/Lines";
import Contact from "@/components/landing/Contact";
import { supportPageContent } from "@/lib/content/support";

export const metadata: Metadata = {
  title: "Support — Fluid Events",
  description:
    "Support organisateur pour Fluid Events : paiement, scanner, QR codes et configuration de vos événements.",
};

export default function SupportPage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden pb-10 pt-28">
        <Lines />
        <Contact
          eyebrow={supportPageContent.eyebrow}
          title={supportPageContent.title}
          description={supportPageContent.description}
        />
      </main>
      <Footer />
    </>
  );
}