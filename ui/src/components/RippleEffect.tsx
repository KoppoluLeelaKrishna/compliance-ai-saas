"use client";

import { useEffect } from "react";

export default function RippleEffect() {
  useEffect(() => {
    function createRipple(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest(".ripple-card");
      if (!target || !(target instanceof HTMLElement)) return;

      // Remove old ripple
      target.querySelectorAll(".ripple-bubble").forEach((el) => el.remove());

      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      const bubble = document.createElement("span");
      bubble.className = "ripple-bubble";
      bubble.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        pointer-events: none;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.06) 40%, transparent 70%);
        transform: scale(0);
        animation: ripple-expand 0.65s cubic-bezier(0.25,0.46,0.45,0.94) forwards;
        z-index: 20;
      `;
      target.appendChild(bubble);

      // clean up after animation
      setTimeout(() => bubble.remove(), 700);
    }

    document.addEventListener("click", createRipple);
    return () => document.removeEventListener("click", createRipple);
  }, []);

  return null;
}
