"use client";

import { useEffect, useRef } from "react";

interface ServiceNode {
  x: number; y: number;
  vx: number; vy: number;
  label: string;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
  size: number;
}

interface Flow {
  from: number; to: number;
  progress: number; speed: number;
}

const AWS_SERVICES = [
  "S3","IAM","EC2","RDS","VPC","KMS","EBS","MFA",
  "CloudTrail","Lambda","STS","SNS","SQS","WAF","EKS",
  "S3","IAM","EC2","RDS","VPC","KMS","EBS","MFA",
  "CloudTrail","EC2","S3","IAM","RDS","VPC","Lambda",
  "CloudTrail","KMS","EBS","WAF","SNS","SQS","EKS","MFA",
  "S3","IAM","EC2","RDS","VPC",
];

const CONNECT_DIST = 190;
const R = 16; const G = 185; const B = 129;

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const nodes: ServiceNode[] = [];
    const flows: Flow[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    }

    function init() {
      nodes.length = 0; flows.length = 0;
      const w  = canvas?.width  ?? window.innerWidth;
      const vh = window.innerHeight;
      const total = AWS_SERVICES.length;

      for (let i = 0; i < total; i++) {
        const band = Math.floor(i / 10);
        const yMin = band * vh * 0.8;
        const yMax = yMin + vh;
        nodes.push({
          x: Math.random() * w,
          y: yMin + Math.random() * (yMax - yMin),
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          label: AWS_SERVICES[i],
          opacity: Math.random() * 0.3 + 0.35,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.008,
          size: AWS_SERVICES[i].length > 3 ? 9 : 11,
        });
      }

      for (let k = 0; k < 12; k++) {
        flows.push({
          from: Math.floor(Math.random() * nodes.length),
          to:   Math.floor(Math.random() * nodes.length),
          progress: Math.random(),
          speed: Math.random() * 0.01 + 0.005,
        });
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Nebula blobs
      const nebulas: [number, number, number, number][] = [
        [canvas.width * 0.12, canvas.height * 0.12, 280, 0.035],
        [canvas.width * 0.82, canvas.height * 0.38, 240, 0.028],
        [canvas.width * 0.5,  canvas.height * 0.62, 300, 0.022],
        [canvas.width * 0.08, canvas.height * 0.78, 200, 0.03],
      ];
      for (const [nx, ny, nr, no] of nebulas) {
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        g.addColorStop(0, `rgba(${R},${G},${B},${no})`);
        g.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }

      // Move nodes
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        n.pulse += n.pulseSpeed;
        if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      }

      // Find active connections
      const active: [number, number, number][] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) active.push([i, j, dist]);
        }
      }

      // Draw connection lines
      for (const [i, j, dist] of active) {
        const alpha = (1 - dist / CONNECT_DIST) * 0.4;
        const grad = ctx.createLinearGradient(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
        grad.addColorStop(0,   `rgba(${R},${G},${B},${alpha * 0.5})`);
        grad.addColorStop(0.5, `rgba(${R},${G},${B},${alpha})`);
        grad.addColorStop(1,   `rgba(${R},${G},${B},${alpha * 0.5})`);
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // Spawn flow particles
      if (active.length > 0 && Math.random() < 0.1) {
        const [fi, fj] = active[Math.floor(Math.random() * active.length)];
        flows.push({ from: fi, to: fj, progress: 0, speed: Math.random() * 0.012 + 0.006 });
        if (flows.length > 35) flows.splice(0, 1);
      }

      // Draw flow particles
      for (let f = flows.length - 1; f >= 0; f--) {
        const fl = flows[f];
        fl.progress += fl.speed;
        if (fl.progress > 1) { flows.splice(f, 1); continue; }

        const fn = nodes[fl.from]; const tn = nodes[fl.to];
        if (!fn || !tn) { flows.splice(f, 1); continue; }

        const dx = fn.x - tn.x; const dy = fn.y - tn.y;
        if (Math.sqrt(dx * dx + dy * dy) > CONNECT_DIST + 20) { flows.splice(f, 1); continue; }

        const fx = fn.x + (tn.x - fn.x) * fl.progress;
        const fy = fn.y + (tn.y - fn.y) * fl.progress;
        const fade = Math.sin(fl.progress * Math.PI);

        const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 7);
        glow.addColorStop(0, `rgba(${R},${G},${B},${fade * 0.55})`);
        glow.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath(); ctx.arc(fx, fy, 7, 0, Math.PI * 2);
        ctx.fillStyle = glow; ctx.fill();

        ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${fade * 0.85})`;
        ctx.fill();
      }

      // Draw AWS service label nodes
      for (const n of nodes) {
        const pulse  = 0.85 + Math.sin(n.pulse) * 0.15;
        const op     = n.opacity * pulse;
        const fsize  = n.size;
        const label  = n.label;

        // Measure label
        ctx.font = `bold ${fsize}px monospace`;
        const tw = ctx.measureText(label).width;
        const th = fsize;
        const pad = 5;
        const bw  = tw + pad * 2;
        const bh  = th + pad * 1.5;

        // Outer glow
        const glowR = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, bw);
        glowR.addColorStop(0, `rgba(${R},${G},${B},${op * 0.3})`);
        glowR.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath(); ctx.arc(n.x, n.y, bw, 0, Math.PI * 2);
        ctx.fillStyle = glowR; ctx.fill();

        // Rounded box background
        const bx = n.x - bw / 2; const by = n.y - bh / 2;
        const cr = 4;
        ctx.beginPath();
        ctx.moveTo(bx + cr, by);
        ctx.lineTo(bx + bw - cr, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + cr, cr);
        ctx.lineTo(bx + bw, by + bh - cr);
        ctx.arcTo(bx + bw, by + bh, bx + bw - cr, by + bh, cr);
        ctx.lineTo(bx + cr, by + bh);
        ctx.arcTo(bx, by + bh, bx, by + bh - cr, cr);
        ctx.lineTo(bx, by + cr);
        ctx.arcTo(bx, by, bx + cr, by, cr);
        ctx.closePath();
        ctx.fillStyle = `rgba(${R},${G},${B},${op * 0.1})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${R},${G},${B},${op * 0.55})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Label text
        ctx.fillStyle = `rgba(${R},${G},${B},${op})`;
        ctx.font = `bold ${fsize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, n.x, n.y);
      }

      animId = requestAnimationFrame(draw);
    }

    resize(); init(); draw();

    const onResize = () => { resize(); init(); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
  );
}
