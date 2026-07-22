"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

interface ScrubTextProps {
  text: string;
  className?: string;
}

export default function ScrubText({ text, className }: ScrubTextProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;
      const wordEls = el.querySelectorAll<HTMLElement>("[data-word]");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        gsap.set(wordEls, { opacity: 1 });
        return;
      }

      gsap.set(wordEls, { opacity: 0.12 });
      gsap.to(wordEls, {
        opacity: 1,
        stagger: 0.05,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "bottom 45%",
          scrub: 0.5,
        },
      });
    },
    { scope: containerRef, dependencies: [text] },
  );

  return (
    <p ref={containerRef} className={className}>
      {words.map((word, i) => (
        <span key={i} data-word className="mr-[0.3em] inline-block">
          {word}
        </span>
      ))}
      <span
        aria-hidden="true"
        className="animate-blink ml-1 inline-block h-[0.85em] w-[3px] -translate-y-[0.05em] bg-current align-middle"
      />
    </p>
  );
}
