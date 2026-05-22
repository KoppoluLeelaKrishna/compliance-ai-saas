"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
  type: "star" | "planet" | "emerald";
  color: string;
}

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const stars: Star[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    }

    function init() {
      stars.length = 0;
      const w = canvas?.width ?? window.innerWidth;
      const h = canvas?.height ?? window.innerHeight;

      // 150 white/blue stars
      for (let i = 0; i < 150; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          size: Math.random() * 1.8 + 0.5,
          opacity: Math.random() * 0.55 + 0.35,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.03 + 0.008,
          type: "star",
          color: Math.random() > 0.5 ? `255,255,255` : `180,210,255`,
        });
      }

      // 60 emerald network dots — distributed across visible height bands
      const vh = window.innerHeight;
      for (let i = 0; i < 60; i++) {
        // Spread across repeating viewport-height bands so there's always a cluster visible
        const band = Math.floor(i / 15); // group into bands of 15
        const yMin = band * vh * 0.9;
        const yMax = yMin + vh;
        stars.push({
          x: Math.random() * w,
          y: yMin + Math.random() * (yMax - yMin),
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 2.5 + 1.5,
          opacity: Math.random() * 0.4 + 0.5,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.025 + 0.012,
          type: "emerald",
          color: `16,185,129`,
        });
      }

      // 10 large planet dots
      const planetColors = [
        `16,185,129`,`100,210,170`,`70,130,220`,
        `150,100,230`,`210,150,60`,`16,185,129`,
        `80,190,230`,`190,80,190`,`16,185,129`,`60,200,160`,
      ];
      for (let i = 0; i < 10; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          size: Math.random() * 4 + 4,
          opacity: Math.random() * 0.3 + 0.55,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.012 + 0.005,
          type: "planet",
          color: planetColors[i],
        });
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Nebula glow blobs (static, painted once per frame cheaply)
      const nebulaData: [number, number, number, string, number][] = [
        [canvas.width * 0.15, canvas.height * 0.18, 280, "16,185,129", 0.025],
        [canvas.width * 0.82, canvas.height * 0.35, 220, "60,100,200", 0.02],
        [canvas.width * 0.5,  canvas.height * 0.65, 300, "16,185,129", 0.018],
        [canvas.width * 0.1,  canvas.height * 0.75, 180, "100,60,200", 0.015],
      ];
      for (const [nx, ny, nr, nc, no] of nebulaData) {
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        g.addColorStop(0,   `rgba(${nc},${no})`);
        g.addColorStop(0.5, `rgba(${nc},${no * 0.4})`);
        g.addColorStop(1,   `rgba(${nc},0)`);
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Move all objects
      for (const s of stars) {
        s.x += s.vx;
        s.y += s.vy;
        s.pulse += s.pulseSpeed;
        if (s.x < 0 || s.x > canvas.width)  s.vx *= -1;
        if (s.y < 0 || s.y > canvas.height) s.vy *= -1;
      }

      // Emerald network connections
      const emeralds = stars.filter(s => s.type === "emerald");
      const CDIST = 220;
      for (let i = 0; i < emeralds.length; i++) {
        for (let j = i + 1; j < emeralds.length; j++) {
          const dx = emeralds[i].x - emeralds[j].x;
          const dy = emeralds[i].y - emeralds[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CDIST) {
            const a = (1 - dist / CDIST) * 0.55;
            const grad = ctx.createLinearGradient(emeralds[i].x, emeralds[i].y, emeralds[j].x, emeralds[j].y);
            grad.addColorStop(0, `rgba(16,185,129,${a})`);
            grad.addColorStop(0.5, `rgba(16,185,129,${a * 1.3})`);
            grad.addColorStop(1, `rgba(16,185,129,${a})`);
            ctx.beginPath();
            ctx.moveTo(emeralds[i].x, emeralds[i].y);
            ctx.lineTo(emeralds[j].x, emeralds[j].y);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }
      }

      // Draw all stars/planets
      for (const s of stars) {
        const pulse = 0.85 + Math.sin(s.pulse) * 0.15;
        const op = s.opacity * pulse;
        const sz = s.size * pulse;

        if (s.type === "star") {
          // Simple twinkling star
          ctx.beginPath();
          ctx.arc(s.x, s.y, sz, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${s.color},${op})`;
          ctx.fill();
          // cross sparkle on brighter stars
          if (sz > 1.0 && op > 0.55) {
            ctx.strokeStyle = `rgba(${s.color},${op * 0.4})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(s.x - sz * 2.5, s.y);
            ctx.lineTo(s.x + sz * 2.5, s.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(s.x, s.y - sz * 2.5);
            ctx.lineTo(s.x, s.y + sz * 2.5);
            ctx.stroke();
          }
        } else if (s.type === "emerald") {
          // Glow halo
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sz * 5);
          g.addColorStop(0, `rgba(${s.color},${op * 0.5})`);
          g.addColorStop(0.5, `rgba(${s.color},${op * 0.15})`);
          g.addColorStop(1, `rgba(${s.color},0)`);
          ctx.beginPath();
          ctx.arc(s.x, s.y, sz * 5, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
          // Core
          ctx.beginPath();
          ctx.arc(s.x, s.y, sz, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${s.color},${op})`;
          ctx.fill();
        } else {
          // Planet — larger with colored glow ring
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sz * 6);
          g.addColorStop(0, `rgba(${s.color},${op * 0.6})`);
          g.addColorStop(0.4, `rgba(${s.color},${op * 0.2})`);
          g.addColorStop(1, `rgba(${s.color},0)`);
          ctx.beginPath();
          ctx.arc(s.x, s.y, sz * 6, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
          // Core
          ctx.beginPath();
          ctx.arc(s.x, s.y, sz, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${s.color},${op})`;
          ctx.fill();
          // Highlight
          ctx.beginPath();
          ctx.arc(s.x - sz * 0.3, s.y - sz * 0.3, sz * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${op * 0.6})`;
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(draw);
    }

    resize();
    init();
    draw();

    const onResize = () => { resize(); init(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
