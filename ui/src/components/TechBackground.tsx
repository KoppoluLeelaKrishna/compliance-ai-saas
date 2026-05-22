"use client";

import { useEffect, useRef } from "react";

interface ServiceNode {
  x: number; y: number;
  vx: number; vy: number;
  label: string;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
  fontSize: number;
}

const AWS_SERVICES = [
  "S3","IAM","EC2","RDS","VPC","KMS","EBS","MFA",
  "CloudTrail","Lambda","STS","SNS","SQS","WAF","EKS",
  "S3","IAM","EC2","RDS","VPC","KMS","EBS","MFA",
  "CloudTrail","Lambda","EC2","S3","IAM","RDS","VPC",
  "CloudTrail","KMS","WAF","SNS","SQS","EKS","MFA","EBS",
  "S3","IAM","EC2","RDS","VPC",
];

const CONNECT = 230;
const R = 16; const G = 185; const B = 129;

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frame = 0;
    const nodes: ServiceNode[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    }

    function init() {
      nodes.length = 0;
      const w  = canvas?.width  ?? window.innerWidth;
      const vh = window.innerHeight;
      const total = AWS_SERVICES.length;

      for (let i = 0; i < total; i++) {
        const band = Math.floor(i / 10);
        const yMin = band * vh * 0.75;
        const yMax = yMin + vh * 0.9;
        nodes.push({
          x: Math.random() * w,
          y: yMin + Math.random() * (yMax - yMin),
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          label: AWS_SERVICES[i],
          opacity: Math.random() * 0.25 + 0.4,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.008,
          fontSize: AWS_SERVICES[i].length > 3 ? 9 : 11,
        });
      }
    }

    function drawPipeline(x1: number, y1: number, x2: number, y2: number, alpha: number, c: CanvasRenderingContext2D) {
      const ctx = c;
      // Outer dark casing
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${R},${G},${B},${alpha * 0.15})`;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.stroke();

      // Inner bright pipe
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0,   `rgba(${R},${G},${B},${alpha * 0.4})`);
      grad.addColorStop(0.5, `rgba(${R},${G},${B},${alpha * 0.8})`);
      grad.addColorStop(1,   `rgba(${R},${G},${B},${alpha * 0.4})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Animated flowing dashes (data stream inside pipe)
      const dashOffset = -(frame * 0.8);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.55})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 10]);
      ctx.lineDashOffset = dashOffset;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function draw() {
      if (!canvas || !ctx) return;
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Nebula blobs
      const nebulas: [number, number, number, number][] = [
        [canvas.width * 0.12, canvas.height * 0.12, 300, 0.04],
        [canvas.width * 0.83, canvas.height * 0.38, 260, 0.03],
        [canvas.width * 0.5,  canvas.height * 0.62, 320, 0.025],
        [canvas.width * 0.08, canvas.height * 0.8,  220, 0.035],
      ];
      for (const [nx, ny, nr, no] of nebulas) {
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        g.addColorStop(0, `rgba(${R},${G},${B},${no})`);
        g.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }

      // Move
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        n.pulse += n.pulseSpeed;
        if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      }

      // Draw pipeline connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT) {
            const alpha = (1 - dist / CONNECT);
            drawPipeline(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, alpha, ctx);
          }
        }
      }

      // Draw service label nodes
      for (const n of nodes) {
        const pulse = 0.88 + Math.sin(n.pulse) * 0.12;
        const op    = n.opacity * pulse;
        const fs    = n.fontSize;
        const label = n.label;

        ctx.font = `bold ${fs}px monospace`;
        const tw  = ctx.measureText(label).width;
        const pad = 5;
        const bw  = tw + pad * 2;
        const bh  = fs + pad * 1.8;

        // Glow halo
        const glowR = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, bw * 1.4);
        glowR.addColorStop(0, `rgba(${R},${G},${B},${op * 0.35})`);
        glowR.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.beginPath(); ctx.arc(n.x, n.y, bw * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = glowR; ctx.fill();

        // Box background
        const bx = n.x - bw / 2; const by = n.y - bh / 2; const cr = 4;
        ctx.beginPath();
        ctx.moveTo(bx + cr, by); ctx.lineTo(bx + bw - cr, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + cr, cr);
        ctx.lineTo(bx + bw, by + bh - cr);
        ctx.arcTo(bx + bw, by + bh, bx + bw - cr, by + bh, cr);
        ctx.lineTo(bx + cr, by + bh);
        ctx.arcTo(bx, by + bh, bx, by + bh - cr, cr);
        ctx.lineTo(bx, by + cr);
        ctx.arcTo(bx, by, bx + cr, by, cr);
        ctx.closePath();
        ctx.fillStyle   = `rgba(${R},${G},${B},${op * 0.12})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${R},${G},${B},${op * 0.7})`;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Label
        ctx.fillStyle    = `rgba(${R},${G},${B},${op})`;
        ctx.font         = `bold ${fs}px monospace`;
        ctx.textAlign    = "center";
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

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />;
}
