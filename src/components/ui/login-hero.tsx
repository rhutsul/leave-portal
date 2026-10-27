"use client";

import dynamic from "next/dynamic";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const MAX_TILT_DEG = 4;

// 3D-стос карток (ADR 0006) — окремим чанком, лише на клієнті й після першого відмальовування форми: three не потрапляє
// ні в HTML сервера, ні в бандл робочих сторінок.
const LoginScene = dynamic(() => import("./login-scene"), { ssr: false });

/**
 * Тло сторінки входу (клас login-hero у globals.css) і картка «скло», що злегка нахиляється за курсором
 * (DESIGN.md, розділ 11). Нахил — лише для миші й лише без prefers-reduced-motion; на дотик і клавіатуру не впливає.
 */
export function LoginHero({ children, className }: { children: ReactNode; className?: string }) {
  const card = useRef<HTMLDivElement>(null);

  function tilt(event: PointerEvent<HTMLDivElement>) {
    const el = card.current;
    if (!el || event.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Курсор — над карткою (обробники на ній), але межу тримаємо й тут: кут не більший за MAX_TILT_DEG / 2.
    const box = el.getBoundingClientRect();
    const x = Math.min(0.5, Math.max(-0.5, (event.clientX - box.left) / box.width - 0.5));
    const y = Math.min(0.5, Math.max(-0.5, (event.clientY - box.top) / box.height - 0.5));
    el.style.transform = `perspective(900px) rotateX(${(-y * MAX_TILT_DEG).toFixed(2)}deg) rotateY(${(x * MAX_TILT_DEG).toFixed(2)}deg)`;
  }

  function reset() {
    if (card.current) card.current.style.transform = "";
  }

  return (
    <div className={cn("login-hero flex flex-1 items-center justify-center px-6 py-16", className)}>
      <LoginScene />
      <div
        ref={card}
        onPointerMove={tilt}
        onPointerLeave={reset}
        className="relative z-10 w-full max-w-sm animate-in fade-in-0 zoom-in-95 transition-transform duration-(--duration-base) ease-out slide-in-from-bottom-2"
      >
        {children}
      </div>
    </div>
  );
}
