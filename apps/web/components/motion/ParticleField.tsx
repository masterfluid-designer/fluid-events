"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
};

// Couleurs lues depuis les CSS custom properties du thème actif (le thème
// est configurable par l'Admin, voir globals.css) plutôt que codées en dur —
// les particules doivent suivre la teinte choisie, pas rester terracotta fixe.
const THEME_COLOR_VARS = [
  "--color-primary",
  "--color-accent-2",
  "--color-accent-3",
  "--color-chart-1",
  "--color-chart-2",
];

function readThemeColors(): string[] {
  if (typeof window === "undefined") return ["#c2703f"];
  const styles = getComputedStyle(document.documentElement);
  const colors = THEME_COLOR_VARS.map((name) => styles.getPropertyValue(name).trim()).filter(
    Boolean,
  );
  return colors.length > 0 ? colors : ["#c2703f"];
}

export default function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = readThemeColors();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let rafId: number;

    const particleCount = () => (window.innerWidth < 768 ? 45 : 110);

    function makeParticle(): Particle {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.06 + Math.random() * 0.16;
      return {
        x: width / 2 + (Math.random() - 0.5) * width * 0.9,
        y: height / 2 + (Math.random() - 0.5) * height * 0.9,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.05,
        size: 1.5 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 0.25 + Math.random() * 0.55,
      };
    }

    function resize() {
      const parent = canvas!.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: particleCount() }, makeParticle);
    }

    function drawStatic() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx!.globalAlpha = p.opacity;
        ctx!.fillStyle = p.color;
        ctx!.beginPath();
        ctx!.ellipse(p.x, p.y, p.size, p.size * 2.2, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function tick() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) {
          p.y = height + 20;
          p.x = width / 2 + (Math.random() - 0.5) * width * 0.9;
        }

        ctx!.globalAlpha = p.opacity;
        ctx!.fillStyle = p.color;
        ctx!.beginPath();
        ctx!.ellipse(p.x, p.y, p.size, p.size * 2.2, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      rafId = requestAnimationFrame(tick);
    }

    resize();
    if (reduceMotion) {
      drawStatic();
    } else {
      rafId = requestAnimationFrame(tick);
    }

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 ${className ?? ""}`}
    />
  );
}
