import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Lines from "@/components/Lines";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import PaymentIntegrations from "@/components/landing/PaymentIntegrations";
import Pricing from "@/components/landing/Pricing";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden bg-alabaster dark:bg-blackho">
        <Lines />
        <Hero />
        <Features />
        <PaymentIntegrations />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
