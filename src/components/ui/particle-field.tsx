"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FieldVariant } from "@/lib/particle-field";
import { cn } from "@/lib/utils";

// three — окремим чанком, лише на клієнті й після першого відмальовування: ні в HTML сервера, ні в бандлі робочих
// сторінок (ADR 0007).
const loadScene = () => import("./particle-scene");
const ParticleScene = dynamic(loadScene, { ssr: false });

// Поле — лише від 1100 px: вужче чанк three не вантажиться зовсім.
const WIDE = "(min-width: 1100px)";
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE).matches;
const isWideOnServer = () => false;

/** Чи є WebGL2; пробний контекст одразу звільняємо, відповідь запам'ятовуємо (strict mode запускає ефект двічі). */
let webgl2: boolean | null = null;
function hasWebGL2() {
  if (webgl2 === null) {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webgl2 = gl !== null;
  }
  return webgl2;
}

// Де складеться аркуш місяця — там, поки поле вантажиться, «дихає» пляма з точок (на landing — праворуч від тексту
// hero, на вході — посередині поля праворуч від форми).
const GHOST: Record<FieldVariant, string> = {
  welcome: "top-[12%] left-[56%] h-[70%] w-[34%]",
  login: "top-[14%] left-[24%] h-[72%] w-[58%]",
};

/**
 * Поле частинок для `/welcome` і `/login` (ADR 0007, DESIGN.md `ParticleField`): декор (`aria-hidden`, без подій
 * миші — курсор слухає сама сцена на `window`). three вантажиться лише вшир від 1100 px, з WebGL2 і без
 * prefers-reduced-motion; інакше лишається тло з крапок.
 *
 * Очікування — частина появи: чанк починає вантажитись одразу після гідратації, а поки сцени ще немає, на місці
 * аркуша тихо «дихає» пляма з точок. Сцена малює перший кадр — пляма згасає, а точки злітаються на її місце.
 */
export function ParticleField({ variant, className }: { variant: FieldVariant; className?: string }) {
  const wide = useSyncExternalStore(subscribeWide, isWide, isWideOnServer);
  const [waiting, setWaiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [ghostGone, setGhostGone] = useState(false);

  useEffect(() => {
    if (!wide || mounted) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !hasWebGL2()) return;
    // Файл three вантажиться вже зараз, паралельно з рештою сторінки; монтуємо сцену у вільну хвилину після першого
    // кадру — до того часу чанк зазвичай уже в браузері.
    // Помилку завантаження ловимо тут: сцена не змонтується, а заглушку прибере тайм-аут нижче.
    loadScene().catch(() => setShown(true));
    const frame = requestAnimationFrame(() => setWaiting(true));
    // Пляма — і в момент монтування: якщо кадр вище ще не стався, вона однаково з'явиться до першого кадру поля.
    const mount = () => {
      setWaiting(true);
      setMounted(true);
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(mount, { timeout: 300 });
      return () => {
        cancelAnimationFrame(frame);
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(mount, 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(id);
    };
  }, [wide, mounted]);

  // Запобіжник: якщо сцена так і не намалювала кадр (вкладку не відкрили, збій), заглушка не «дихає» вічно.
  useEffect(() => {
    if (!waiting || shown) return;
    const id = setTimeout(() => setShown(true), 8000);
    return () => clearTimeout(id);
  }, [waiting, shown]);

  // Вужче за 1100 px поле ховаємо, а не розмонтовуємо: повернення ширини не будує сцену й не програє появу знову.
  return (
    <div aria-hidden="true" className={cn("pointer-events-none", !wide && "hidden", className)}>
      {waiting && !ghostGone && (
        <div
          onTransitionEnd={() => shown && setGhostGone(true)}
          className={cn(
            "absolute transition-opacity duration-(--duration-slow) ease-out",
            GHOST[variant],
            shown ? "opacity-0" : "opacity-100",
          )}
        >
          {/* Пульс зупиняється, щойно точки почали злітатись: разом з появою — не більше двох рухів. */}
          <div className={cn("field-ghost size-full", !shown && "animate-pulse-slow")} />
        </div>
      )}
      {mounted && <ParticleScene variant={variant} onReady={() => setShown(true)} />}
    </div>
  );
}
