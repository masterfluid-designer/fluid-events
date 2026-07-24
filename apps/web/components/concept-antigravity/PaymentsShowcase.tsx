"use client";

import { useRef } from "react";
import Image from "next/image";
import { Ticket } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import Typewriter from "@/components/motion/Typewriter";
import type { PaymentLogo } from "@/lib/payment-logos.server";
import { paymentsContent } from "@/lib/content/landing/payments";

const ITEM_SIZE = 80;

interface PaymentsShowcaseProps {
  /** Lu côté serveur depuis public/images/payment-logos/ (getPaymentLogos()). */
  logos: PaymentLogo[];
}

export default function PaymentsShowcase({ logos }: PaymentsShowcaseProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  useGSAP(
    () => {
      const items = itemRefs.current.filter(Boolean) as HTMLDivElement[];
      if (items.length === 0 || !sectionRef.current || !circleRef.current) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Rayon dérivé de la taille réelle du conteneur (responsive) plutôt
      // qu'une constante fixe — évite que les logos débordent sur mobile.
      // Recalculé au resize (pas juste au montage), sinon un logo positionné
      // pour un rayon "desktop" déborde une fois la fenêtre rétrécie.
      let radius = circleRef.current.clientWidth / 2 - ITEM_SIZE / 2 - 8;
      let currentAngle = 0;

      function place(offset: number) {
        currentAngle = offset;
        items.forEach((el, i) => {
          const angle = (i / items.length) * Math.PI * 2 + offset;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          // xPercent/yPercent recentrent l'élément sur son point d'ancrage ;
          // GSAP compose ça avec x/y dans le même transform (contrairement à
          // une classe Tailwind translate-1/2 qui serait écrasée par gsap.set).
          gsap.set(el, { x, y, xPercent: -50, yPercent: -50 });
        });
      }
      place(0);

      function handleResize() {
        if (!circleRef.current) return;
        radius = circleRef.current.clientWidth / 2 - ITEM_SIZE / 2 - 8;
        place(currentAngle);
      }
      window.addEventListener("resize", handleResize);

      if (textRef.current) {
        if (reduceMotion) {
          gsap.set(textRef.current, { opacity: 1, scale: 1 });
        } else {
          const target = textRef.current;
          gsap.set(target, { opacity: 0, scale: 0.5 });
          // Deux tweens distincts (pas un seul reversé) pour pouvoir donner
          // à chaque sens sa propre courbe : ease-in à l'entrée (0.5→1),
          // ease-out à la sortie (1→0.5), dans les deux sens de scroll.
          const growIn = () =>
            gsap.to(target, { opacity: 1, scale: 1, duration: 0.8, ease: "power2.in", overwrite: true });
          const shrinkOut = () =>
            gsap.to(target, { opacity: 0, scale: 0.5, duration: 0.8, ease: "power2.out", overwrite: true });
          ScrollTrigger.create({
            trigger: target,
            start: "top 85%",
            end: "bottom 15%",
            onEnter: growIn,
            onEnterBack: growIn,
            onLeave: shrinkOut,
            onLeaveBack: shrinkOut,
          });
        }
      }

      if (reduceMotion) {
        return () => window.removeEventListener("resize", handleResize);
      }

      // Le cercle tourne légèrement (les logos restent droits — seule leur
      // position sur l'anneau change) au fil du scroll de la section.
      const state = { angle: 0 };
      gsap.to(state, {
        angle: Math.PI * 0.6,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.6,
        },
        onUpdate: () => place(state.angle),
      });

      return () => window.removeEventListener("resize", handleResize);
    },
    { scope: sectionRef, dependencies: [logos.length] },
  );

  return (
    <section id="payments" ref={sectionRef} className="py-20 md:py-28">
      <div ref={textRef} className="mx-auto max-w-c-1016 px-6 text-center md:px-12">
        <span className="text-accent-terracotta dark:text-accent-terracotta-dark text-sectiontitle font-bold uppercase tracking-[0.06em]">
          {paymentsContent.eyebrow}
        </span>
        <h2 className="font-space-grotesk mt-3 text-3xl font-medium text-black md:text-5xl dark:text-white">
          <Typewriter once segments={[{ text: paymentsContent.title }]} />
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-regular text-waterloo dark:text-manatee">
          {paymentsContent.description}
        </p>
      </div>

      <div
        ref={circleRef}
        className="relative mx-auto mt-16 flex size-[clamp(280px,50vw,900px)] items-center justify-center"
      >
        {/* Onde radar : 3 anneaux concentriques qui grossissent et
            s'estompent en boucle, décalés dans le temps — à un instant
            donné on voit donc naturellement un anneau net (accent) près du
            logo et des anneaux de plus en plus pâles autour, qui donnent
            l'impression d'une propagation continue vers l'extérieur. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="animate-radar-ping border-primary absolute size-20 rounded-full border-2"
              style={{ animationDelay: `${i * 1.3}s` }}
            />
          ))}
        </div>
        <div className="border-primary/40 relative flex size-20 items-center justify-center rounded-full border bg-zumthor shadow-solid-7 dark:bg-btndark">
          <Ticket className="text-primary size-8" />
        </div>
        {logos.map((logo, i) => (
          <div
            key={logo.name}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="absolute left-1/2 top-1/2 flex size-16 items-center justify-center rounded-[10px] bg-white p-3 shadow-solid-7 sm:size-20 sm:p-4 dark:bg-btndark"
          >
            <Image
              width={64}
              height={64}
              src={logo.src}
              alt={logo.name}
              className="max-h-12 w-auto object-contain sm:max-h-14"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
