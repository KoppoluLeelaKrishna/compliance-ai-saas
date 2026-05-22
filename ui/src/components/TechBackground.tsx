"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
}

const COUNT = 90;
const CONNECT_DIST = 160;
const R = 16;
const G = 185;
const B = 129;

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    }

    function init() {
      particles.length = 0;
      const w = canvas?.width ?? window.innerWidth;
      const h = canvas?.height ?? window.innerHeight;
      for (let i = 0; i < COUNT; i++) {
        const big = Math.random() < 0.15; // 15% are large glowing dots
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: big ? Math.random() * 2.5 + 2 : Math.random() * 1.5 + 0.8,
          opacity: big ? Math.random() * 0.4 + 0.5 : Math.random() * 0.35 + 0.25,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.008,
        });
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Move
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }

      // Connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.22;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(${R},${G},${B},${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      // Dots
      for (const p of particles) {
        const pulse = 0.85 + Math.sin(p.pulse) * 0.15;
        const finalOpacity = p.opacity * pulse;
        const finalSize = p.size * pulse;

        // outer glow halo
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, finalSize * 5);
        glow.addColorStop(0, `rgba(${R},${G},${B},${finalOpacity * 0.35})`);
        glow.addColorStop(0.4, `rgba(${R},${G},${B},${finalOpacity * 0.12})`);
        glow.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, finalSize * 5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // solid core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, finalSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${R},${G},${B},${finalOpacity})`;
        ctx.fill();

        // bright center highlight
        ctx.beginPath();
        ctx.arc(p.x - finalSize * 0.25, p.y - finalSize * 0.25, finalSize * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${finalOpacity * 0.5})`;
        ctx.fill();
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
