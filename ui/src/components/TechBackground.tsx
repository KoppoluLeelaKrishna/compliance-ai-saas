"use client";

import { useEffect, useRef } from "react";

interface Dot {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
}

interface Flow {
  from: number;
  to: number;
  progress: number;
  speed: number;
}

const DOT_COUNT = 80;
const CONNECT_DIST = 200;
const R = 16; const G = 185; const B = 129;

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const dots: Dot[] = [];
    const flows: Flow[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    }

    function init() {
      dots.length = 0;
      flows.length = 0;
      const w = canvas?.width ?? window.innerWidth;
      const vh = window.innerHeight;

      // Distribute dots in bands so every viewport has a cluster
      for (let i = 0; i < DOT_COUNT; i++) {
        const band = Math.floor(i / 20);
        const yMin = band * vh * 0.85;
        const yMax = yMin + vh;
        dots.push({
          x: Math.random() * w,
          y: yMin + Math.random() * (yMax - yMin),
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          size: Math.random() * 2.5 + 1.2,
          opacity: Math.random() * 0.35 + 0.5,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.025 + 0.01,
        });
      }

      // Seed some initial flow particles
      for (let k = 0; k < 15; k++) {
        flows.push({
          from: Math.floor(Math.random() * DOT_COUNT),
          to: Math.floor(Math.random() * DOT_COUNT),
          progress: Math.random(),
          speed: Math.random() * 0.008 + 0.005,
        });
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Subtle nebula glow blobs
      const nebulas: [number, number, number, number][] = [
        [canvas.width * 0.15, canvas.height * 0.15, 300, 0.03],
        [canvas.width * 0.8,  canvas.height * 0.4,  250, 0.025],
        [canvas.width * 0.5,  canvas.height * 0.65, 320, 0.02],
        [canvas.width * 0.1,  canvas.height * 0.8,  200, 0.025],
      ];
      for (const [nx, ny, nr, no] of nebulas) {
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        g.addColorStop(0, `rgba(${R},${G},${B},${no})`);
        g.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Move dots
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        d.pulse += d.pulseSpeed;
        if (d.x < 0 || d.x > canvas.width)  d.vx *= -1;
        if (d.y < 0 || d.y > canvas.height) d.vy *= -1;
      }

      // Find active connections this frame
      const active: [number, number, number][] = []; // [i, j, dist]
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            active.push([i, j, dist]);
          }
        }
      }

      // Draw connection lines
      for (const [i, j, dist] of active) {
        const alpha = (1 - dist / CONNECT_DIST) * 0.45;
        const grad = ctx.createLinearGradient(dots[i].x, dots[i].y, dots[j].x, dots[j].y);
        grad.addColorStop(0,   `rgba(${R},${G},${B},${alpha * 0.5})`);
        grad.addColorStop(0.5, `rgba(${R},${G},${B},${alpha})`);
        grad.addColorStop(1,   `rgba(${R},${G},${B},${alpha * 0.5})`);
        ctx.beginPath();
        ctx.moveTo(dots[i].x, dots[i].y);
        ctx.lineTo(dots[j].x, dots[j].y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Spawn new flow particles along active connections
      if (active.length > 0 && Math.random() < 0.12) {
        const [ri, rj] = active[Math.floor(Math.random() * active.length)];
        flows.push({
          from: ri, to: rj,
          progress: 0,
          speed: Math.random() * 0.012 + 0.006,
        });
        if (flows.length > 40) flows.splice(0, 1);
      }

      // Draw and advance flow particles (traveling dots along lines)
      for (let f = flows.length - 1; f >= 0; f--) {
        const flow = flows[f];
        flow.progress += flow.speed;
        if (flow.progress > 1) { flows.splice(f, 1); continue; }

        const from = dots[flow.from];
        const to   = dots[flow.to];
        if (!from || !to) { flows.splice(f, 1); continue; }

        // Check still connected
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        if (Math.sqrt(dx * dx + dy * dy) > CONNECT_DIST + 20) {
          flows.splice(f, 1); continue;
        }

        const fx = from.x + (to.x - from.x) * flow.progress;
        const fy = from.y + (to.y - from.y) * flow.progress;
        const fade = Math.sin(flow.progress * Math.PI); // peak at midpoint

        // Glow halo
        const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8);
        glow.addColorStop(0, `rgba(${R},${G},${B},${fade * 0.5})`);
        glow.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath(); ctx.arc(fx, fy, 8, 0, Math.PI * 2);
        ctx.fillStyle = glow; ctx.fill();

        // Bright core
        ctx.beginPath();
        ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${fade * 0.9})`;
        ctx.fill();

        // Emerald ring
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${R},${G},${B},${fade * 0.7})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw dots
      for (const d of dots) {
        const pulse = 0.85 + Math.sin(d.pulse) * 0.15;
        const op = d.opacity * pulse;
        const sz = d.size * pulse;

        // Outer glow
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, sz * 5);
        g.addColorStop(0, `rgba(${R},${G},${B},${op * 0.45})`);
        g.addColorStop(0.5, `rgba(${R},${G},${B},${op * 0.15})`);
        g.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath(); ctx.arc(d.x, d.y, sz * 5, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();

        // Core dot
        ctx.beginPath(); ctx.arc(d.x, d.y, sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${R},${G},${B},${op})`;
        ctx.fill();

        // White highlight
        ctx.beginPath();
        ctx.arc(d.x - sz * 0.25, d.y - sz * 0.25, sz * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${op * 0.6})`;
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
