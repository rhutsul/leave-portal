"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FieldVariant } from "@/lib/particle-field";
import { cn } from "@/lib/utils";

// three — окремим чанком, лише на клієнті й після першого відмальовування: ні в HTML сервера, ні в бандлі робочих
// сторінок (ADR 0007).
const ParticleScene = dynamic(() => import("./particle-scene"), { ssr: false });

// Поле — лише від 1100 px: вужче чанк three не вантажиться зовсім.
const WIDE = "(min-width: 1100px)";
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE).matches;
const isWideOnServer = () => false;

/** Чи є WebGL2; пробний контекст одразу звільняємо. */
function hasWebGL2() {
  const gl = document.createElement("canvas").getContext("webgl2");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return gl !== null;
}

/**
 * Поле частинок для `/welcome` і `/login` (ADR 0007, DESIGN.md `ParticleField`): декор (`aria-hidden`, без подій
 * миші — курсор слухає сама сцена на `window`). three вантажиться лише вшир від 1100 px, з WebGL2 і без
 * prefers-reduced-motion, у вільний час браузера після першого кадру; інакше лишається тло з крапок.
 */
export function ParticleField({ variant, className }: { variant: FieldVariant; className?: string }) {
  const wide = useSyncExternalStore(subscribeWide, isWide, isWideOnServer);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!wide || ready) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !hasWebGL2()) return;
    if ("requestIdleCallback" in window) {
      // Короткий тайм-аут: поле не чекає довго на вільну хвилину, а починає вантажитись одразу після першого кадру.
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 300 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(id);
  }, [wide, ready]);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      {wide && ready && <ParticleScene variant={variant} />}
    </div>
  );
}
