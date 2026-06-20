"use client";

import { useEffect, useRef, useState } from "react";

interface Petal {
  x: number; y: number; size: number;
  speedX: number; speedY: number;
  rotation: number; rotationSpeed: number;
  opacity: number; flowerType: number; color: string;
}

// 中国传统花卉色系：牡丹红、梅粉、菊金、桃红、荷粉、兰紫
const PEONY_COLORS = ["#C12C3C", "#DC143C", "#E84855", "#A01530", "#CD5C5C"];
const PLUM_COLORS  = ["#F5A0B5", "#FFB6C1", "#FF69B4", "#DB7093", "#FFC0CB"];
const CHRYS_COLORS  = ["#FFD700", "#FFA500", "#F0A030", "#FFBF00", "#FF8C00"];
const PEACH_COLORS  = ["#FFB7C5", "#FF9EAF", "#FFAAB8", "#F8A4B8", "#FFB3C6"];
const LOTUS_COLORS  = ["#FFB6C1", "#FFA0B0", "#FF99AA", "#F8C8D2", "#FFB3C6"];
const ALL_COLORS = [...PEONY_COLORS, ...PLUM_COLORS, ...CHRYS_COLORS, ...PEACH_COLORS, ...LOTUS_COLORS];

// 0=牡丹 1=梅花 2=菊花 3=桃花 4=荷花
const FLOWER_TYPES = 5;
const PETAL_COUNT = 35;

function pickColor(type: number): string {
  const map: Record<number, string[]> = {
    0: PEONY_COLORS, 1: PLUM_COLORS, 2: CHRYS_COLORS, 3: PEACH_COLORS, 4: LOTUS_COLORS,
  };
  const colors = map[type] || ALL_COLORS;
  return colors[Math.floor(Math.random() * colors.length)];
}

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

    const createPetal = (randomY: boolean): Petal => {
      const ft = Math.floor(Math.random() * FLOWER_TYPES);
      return {
        x: Math.random() * innerWidth,
        y: randomY ? Math.random() * innerHeight : -40,
        size: 4 + Math.random() * 14,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: 0.25 + Math.random() * 0.8,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.012,
        opacity: 0.12 + Math.random() * 0.35,
        flowerType: ft,
        color: pickColor(ft),
      };
    };

    const petals: Petal[] = Array.from({ length: PETAL_COUNT }, () => createPetal(true));

    // ====== 牡丹 (peony) — 重瓣大花 ======
    const drawPeony = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      const R = p.size * 0.55;
      const r = p.size * 0.28;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = p.opacity * 0.8;
      ctx.beginPath();
      ctx.ellipse(0, R * 0.3, r, r * 0.75, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.25, r * 0.8, r * 0.7, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFE4B5";
      ctx.globalAlpha = p.opacity * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // ====== 梅花 (plum blossom) — 五瓣小花 ======
    const drawPlum = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      const R = p.size * 0.55;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const cx = Math.cos(angle) * R * 0.4;
        const cy = Math.sin(angle) * R * 0.4;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 0.45, R * 0.3, angle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#FFE4B5";
      ctx.globalAlpha = p.opacity * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // ====== 菊花 (chrysanthemum) — 细长放射花瓣 ======
    const drawChrysanthemum = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      const R = p.size * 0.6;
      const count = 12;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const ex = Math.cos(angle) * R;
        const ey = Math.sin(angle) * R;
        const sx = Math.cos(angle) * R * 0.2;
        const sy = Math.sin(angle) * R * 0.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.fillStyle = "#FFE4B5";
      ctx.globalAlpha = p.opacity * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // ====== 桃花 (peach blossom) — 五瓣 + 双色渐变 ======
    const drawPeach = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      const R = p.size * 0.5;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const cx = Math.cos(angle) * R * 0.35;
        const cy = Math.sin(angle) * R * 0.35;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
        g.addColorStop(0, p.color);
        g.addColorStop(0.7, "#FFE4E1");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 0.5, R * 0.32, angle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#FFD700";
      ctx.globalAlpha = p.opacity * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // ====== 荷花 (lotus) — 长椭圆水滴瓣 ======
    const drawLotus = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      const R = p.size * 0.55;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const cx = Math.cos(angle) * R * 0.3;
        const cy = Math.sin(angle) * R * 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * 0.28, R * 0.5, angle + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#FFE4B5";
      ctx.globalAlpha = p.opacity * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawFunctions = [drawPeony, drawPlum, drawChrysanthemum, drawPeach, drawLotus];

    let lastTime = 0;
    const FRAME_INTERVAL = 45;

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
        if (p.y > innerHeight + 40) { Object.assign(p, createPetal(false)); p.y = -40; }
        if (p.x < -40) p.x = innerWidth + 40;
        if (p.x > innerWidth + 40) p.x = -40;
        drawFunctions[p.flowerType](p);
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

  return <canvas ref={canvasRef} style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:99999 }} />;
}
