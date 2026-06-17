"use client";

import { useEffect, useRef, useState } from "react";

interface Petal {
  x: number; y: number; size: number;
  speedX: number; speedY: number;
  rotation: number; rotationSpeed: number;
  opacity: number; type: number; color: string;
}

// 牡丹花色系: 红、粉、玫红、淡紫
const COLORS = ["#C12C3C", "#E84855", "#F5A0B5", "#DC143C", "#DB7093", "#FFB6C1", "#C71585"];
const PETAL_COUNT = 16;

export default function FallingPetals() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(true);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("petals_enabled");
    if (saved !== null) setEnabled(saved === "true");
    const handler = (e: Event) => setEnabled((e as CustomEvent).detail);
    window.addEventListener("petals-toggle", handler);
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => window.removeEventListener("petals-toggle", handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || prefersReducedMotion.current) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let resizeTimer: ReturnType<typeof setTimeout>;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const throttledResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    };
    window.addEventListener("resize", throttledResize);

    const createPetal = (randomY: boolean): Petal => ({
      x: Math.random() * innerWidth,
      y: randomY ? Math.random() * innerHeight : -30,
      size: Math.random() < 0.5 ? 8 + Math.random() * 10 : 4 + Math.random() * 6,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: 0.3 + Math.random() * 0.7,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.01,
      opacity: 0.15 + Math.random() * 0.3,
      type: Math.floor(Math.random() * 3),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });

    const petals: Petal[] = Array.from({ length: PETAL_COUNT }, () => createPetal(true));

    // 牡丹花瓣 — 多层圆形叠加，模拟重瓣效果
    const drawPeony = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;

      const outerR = p.size * 0.5;
      const innerR = p.size * 0.25;

      // 外层大花瓣
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, outerR, outerR * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      // 内层小花瓣 — 稍深色
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity * 1.2;
      ctx.beginPath();
      ctx.ellipse(0, outerR * 0.2, innerR, innerR * 0.8, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // 中心点缀
      ctx.fillStyle = "#FFE4B5";
      ctx.globalAlpha = p.opacity * 0.6;
      ctx.beginPath();
      ctx.arc(outerR * 0.15, -outerR * 0.1, innerR * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawRound = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      const g = ctx.createRadialGradient(0, 0, p.size * 0.1, 0, 0, p.size);
      g.addColorStop(0, "#FFE4B5");
      g.addColorStop(0.5, p.color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    let lastTime = 0;
    const FRAME_INTERVAL = 50;

    const animate = (timestamp: number) => {
      if (timestamp - lastTime < FRAME_INTERVAL) {
        animId = requestAnimationFrame(animate);
        return;
      }
      lastTime = timestamp;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of petals) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;
        if (p.y > innerHeight + 30) { Object.assign(p, createPetal(false)); p.y = -30; }
        if (p.x < -30) p.x = innerWidth + 30;
        if (p.x > innerWidth + 30) p.x = -30;
        if (p.type === 0) drawPeony(p);
        else if (p.type === 1) drawRound(p);
        else drawRound(p);
      }
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", throttledResize);
    };
  }, [enabled]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0 }} />;
}
