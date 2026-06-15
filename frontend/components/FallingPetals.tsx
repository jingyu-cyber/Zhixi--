"use client";

import { useEffect, useRef, useState } from "react";

interface Petal {
  x: number; y: number; size: number;
  speedX: number; speedY: number;
  rotation: number; rotationSpeed: number;
  opacity: number; type: number; color: string;
}

const COLORS = ["#34d399","#10b981","#059669","#06b6d4","#a78bfa","#f9a8d4","#fbbf24"];
const PETAL_COUNT = 20;

export default function FallingPetals() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(true);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("petals_enabled");
    if (saved !== null) setEnabled(saved === "true");
    const handler = (e: Event) => setEnabled((e as CustomEvent).detail);
    window.addEventListener("petals-toggle", handler);
    // 检测用户是否偏好减少动画
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
      y: randomY ? Math.random() * innerHeight : -20,
      size: Math.random() < 0.5 ? 4 + Math.random() * 6 : 2 + Math.random() * 3,
      speedX: (Math.random() - 0.5) * 0.6,
      speedY: 0.4 + Math.random() * 1.0,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.015,
      opacity: 0.2 + Math.random() * 0.35,
      type: Math.random() < 0.5 ? 0 : 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });

    const petals: Petal[] = Array.from({ length: PETAL_COUNT }, () => createPetal(true));

    const draw = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      if (p.type === 0) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.5, p.size * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
        g.addColorStop(0, p.color);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    let lastTime = 0;
    const FRAME_INTERVAL = 50; // ~20fps 节省GPU

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
        if (p.y > innerHeight + 20) { Object.assign(p, createPetal(false)); p.y = -20; }
        if (p.x < -20) p.x = innerWidth + 20;
        if (p.x > innerWidth + 20) p.x = -20;
        draw(p);
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
