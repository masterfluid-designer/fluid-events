import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Lines from "@/components/Lines";
import ConceptHero from "@/components/concept-antigravity/Hero";
import ProductStage from "@/components/concept-antigravity/ProductStage";
import IconRow from "@/components/concept-antigravity/IconRow";
import Mission from "@/components/concept-antigravity/Mission";
import Showcase from "@/components/concept-antigravity/Showcase";
import RolesCarousel from "@/components/concept-antigravity/RolesCarousel";
import Pricing from "@/components/concept-antigravity/Pricing";
import TrustedByCarousel from "@/components/concept-antigravity/TrustedByCarousel";
import PaymentsShowcase from "@/components/concept-antigravity/PaymentsShowcase";
import BlogCarousel from "@/components/concept-antigravity/BlogCarousel";
import DarkCta from "@/components/concept-antigravity/DarkCta";

export const metadata: Metadata = {
  title: "Concept — Motion design (interne)",
  robots: { index: false, follow: false },
};

export default function ConceptAntigravityPage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden">
        <Lines />
        <ConceptHero />
        <ProductStage />
        <div className="py-16 md:py-20">
          <IconRow />
        </div>
        <Mission />
        <Showcase />
        <RolesCarousel />
        <Pricing />
        <TrustedByCarousel />
        <PaymentsShowcase />
        <BlogCarousel />
        <DarkCta />
      </main>
      <Footer />
    </>
  );
}
