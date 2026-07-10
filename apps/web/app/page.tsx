import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Lines from "@/components/Lines";
import Hero from "@/components/landing/Hero";
import PartnerStrip from "@/components/landing/PartnerStrip";
import Features from "@/components/landing/Features";
import About from "@/components/landing/About";
import FeaturesTab from "@/components/landing/FeaturesTab";
import FunFact from "@/components/landing/FunFact";
import PaymentIntegrations from "@/components/landing/PaymentIntegrations";
import CTA from "@/components/landing/CTA";
import FAQ from "@/components/landing/FAQ";
import Testimonial from "@/components/landing/Testimonial";
import Pricing from "@/components/landing/Pricing";
import Contact from "@/components/landing/Contact";
import Blog from "@/components/landing/Blog";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden bg-alabaster dark:bg-black">
        <Lines />
        <Hero />
        <PartnerStrip />
        <Features />
        <About />
        <FeaturesTab />
        <FunFact />
        <PaymentIntegrations />
        <CTA />
        <FAQ />
        <Testimonial />
        <Pricing />
        <Contact />
        <Blog />
      </main>
      <Footer />
    </>
  );
}
