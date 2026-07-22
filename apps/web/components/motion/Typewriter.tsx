"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

type Segment = { text: string; className?: string };

interface TypewriterProps {
  segments: Segment[] | string;
  /** Secondes pour révéler (ou brouiller) l'intégralité du texte. */
  scrambleDuration?: number;
  /**
   * Élément stable sur lequel caler le ScrollTrigger (utile seulement quand
   * `once` est false, voir plus bas). Sans lui, se rabat sur son propre
   * conteneur.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /**
   * true : joue une seule fois à l'entrée en viewport, ne repart jamais en
   * arrière — sûr même sans triggerRef stable (le trigger s'auto-détruit
   * après déclenchement, donc le reflow du texte pendant l'animation ne
   * peut plus le perturber). false (défaut) : bascule play/reverse selon la
   * présence dans la bande centrale du viewport — nécessite un triggerRef
   * stable (voir Hero), sinon le reflow du texte animé fausse le déclencheur.
   */
  once?: boolean;
}

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CURSOR_CLASS =
  "animate-blink inline-block h-[0.85em] w-[2px] -translate-y-[0.05em] bg-current align-middle";

function normalizeSegments(input: Segment[] | string): Segment[] {
  return typeof input === "string" ? [{ text: input }] : input;
}

function randomChar(source: string) {
  return source === " " ? " " : CHARSET[Math.floor(Math.random() * CHARSET.length)];
}

function scrambleText(str: string) {
  return Array.from(str, randomChar).join("");
}

export default function Typewriter({
  segments,
  scrambleDuration,
  triggerRef,
  once = false,
}: TypewriterProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const segs = normalizeSegments(segments);
  const fullText = segs.map((s) => s.text).join("");
  const fullLength = fullText.length;

  useGSAP(
    () => {
      const trigger = triggerRef?.current ?? containerRef.current;
      const spans = wrapperRef.current
        ? (Array.from(wrapperRef.current.children) as HTMLSpanElement[])
        : [];
      if (spans.length === 0 || !trigger) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        spans.forEach((el, i) => {
          el.textContent = segs[i].text;
        });
        return;
      }

      // Le curseur suit exactement la frontière révélé/brouillé : chaque
      // segment est reconstruit en [texte révélé, curseur, texte brouillé],
      // le curseur n'apparaissant que dans le segment où tombe la frontière.
      function render(revealCount: number) {
        let consumed = 0;
        let cursorPlaced = false;
        segs.forEach((seg, i) => {
          const el = spans[i];
          if (!el) return;
          const segStart = consumed;
          const segEnd = segStart + seg.text.length;
          consumed = segEnd;

          el.textContent = "";

          if (revealCount < segStart) {
            el.appendChild(document.createTextNode(scrambleText(seg.text)));
          } else if (revealCount > segEnd || cursorPlaced) {
            el.appendChild(document.createTextNode(seg.text));
          } else {
            const local = revealCount - segStart;
            el.appendChild(document.createTextNode(seg.text.slice(0, local)));
            const cursor = document.createElement("span");
            cursor.setAttribute("aria-hidden", "true");
            cursor.className = CURSOR_CLASS;
            el.appendChild(cursor);
            cursorPlaced = true;
            el.appendChild(document.createTextNode(scrambleText(seg.text.slice(local))));
          }
        });
      }

      render(0);

      const duration = scrambleDuration ?? Math.max(fullLength * 0.03, 0.5);
      const state = { reveal: 0 };
      const tween = gsap.to(state, {
        reveal: fullLength,
        duration,
        ease: "none",
        paused: true,
        onUpdate: () => render(Math.floor(state.reveal)),
      });

      if (once) {
        const st = ScrollTrigger.create({
          trigger,
          start: "top 85%",
          once: true,
          onEnter: () => tween.play(),
        });
        return () => {
          st.kill();
          tween.kill();
        };
      }

      const st = ScrollTrigger.create({
        trigger,
        start: "top 70%",
        end: "bottom 30%",
        onToggle: (self) => {
          if (self.isActive) tween.play();
          else tween.reverse();
        },
      });

      return () => {
        st.kill();
        tween.kill();
      };
    },
    { scope: containerRef, dependencies: [fullText, once] },
  );

  return (
    <span ref={containerRef} className="relative">
      <span ref={wrapperRef} aria-hidden="true">
        {segs.map((seg, i) => (
          <span key={i} className={seg.className} />
        ))}
      </span>
      <span className="sr-only">{fullText}</span>
    </span>
  );
}
