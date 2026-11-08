"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { fieldTier, type FieldLayout, type FieldTier, type FieldVariant } from "@/lib/particle-field";
import { cn } from "@/lib/utils";

// three — окремим чанком, лише на клієнті й після першого відмальовування: ні в HTML сервера, ні в бандлі робочих
// сторінок (ADR 0007).
const loadScene = () => import("./particle-scene");
const ParticleScene = dynamic(loadScene, { ssr: false });

// Рівень поля (ADR 0008, пункт 10) — з ширини, вказівника й reduced motion: за ними й стежимо. WebGL2, Save-Data і
// пристрій за сеанс не змінюються, їх читаємо разом.
const WIDE = "(min-width: 64rem)";
const FINE = "(pointer: fine)";
const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeTier(onChange: () => void) {
  const queries = [WIDE, FINE, REDUCED].map((q) => window.matchMedia(q));
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

/** Navigator з нестандартними властивостями: `deviceMemory` і `connection` є лише в Chromium. */
type DeviceNavigator = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** Рівень і розкладка одним рядком (useSyncExternalStore порівнює знімки за значенням). */
function readTier(): `${FieldTier}:${FieldLayout}` {
  const nav = navigator as DeviceNavigator;
  const env = {
    wide: window.matchMedia(WIDE).matches,
    finePointer: window.matchMedia(FINE).matches,
    reducedMotion: window.matchMedia(REDUCED).matches,
    saveData: nav.connection?.saveData,
    cores: nav.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
  };
  // Спершу дешеві умови: пробний контекст WebGL2 створюємо, лише якщо без нього поле таки було б.
  const possible = fieldTier({ ...env, webgl2: true }) !== "none";
  const tier = fieldTier({ ...env, webgl2: possible && hasWebGL2() });
  const wide = env.wide;
  return `${tier}:${wide ? "wide" : "narrow"}`;
}
const tierOnServer = () => "none:wide" as const;

/** Рівень і розкладка поля; на сервері й до гідратації — поля немає. */
function useFieldTier() {
  return useSyncExternalStore(subscribeTier, readTier, tierOnServer).split(":") as [FieldTier, FieldLayout];
}

// Сторінка довантажилась (подія `load`): легке поле чекає на неї — на повільній мобільній мережі чанк three інакше
// ділив би канал зі шрифтами й стилями першого екрана. Повне вантажиться одразу, як і було.
function subscribeLoad(onChange: () => void) {
  window.addEventListener("load", onChange);
  return () => window.removeEventListener("load", onChange);
}
const isLoaded = () => document.readyState === "complete";
const loadedOnServer = () => false;

// Після гідратації рівень уже відомий: тоді й ставимо `data-field-tier`. До того (і на сервері) атрибута немає, тож
// сторінка не «стрибає» на звичайному пристрої, а без поля прибирає місце під нього (ADR 0008, пункт 10).
const noSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

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
// Вужче за `lg` аркуш landing — над заголовком hero, а поле входу — смуга над карткою.
const GHOST: Record<FieldLayout, Record<FieldVariant, string>> = {
  wide: {
    welcome: "top-[12%] left-[56%] h-[70%] w-[34%]",
    login: "top-[14%] left-[24%] h-[72%] w-[58%]",
  },
  narrow: {
    welcome: "top-[9%] left-[25%] h-[24%] w-[50%]",
    login: "top-[12%] left-[22%] h-[76%] w-[56%]",
  },
};

/**
 * Коли й як з'являється сцена: `waiting` — показати плямку-заглушку, `mounted` — змонтувати сцену, `shown` — сцена
 * намалювала перший кадр (або не змогла), плямка згасає.
 */
function useSceneMount(ready: boolean) {
  const [waiting, setWaiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!ready || mounted) return;
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
    const idle = "requestIdleCallback" in window;
    const id = idle ? window.requestIdleCallback(mount, { timeout: 300 }) : window.setTimeout(mount, 100);
    return () => {
      cancelAnimationFrame(frame);
      if (idle) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [ready, mounted]);

  // Запобіжник: якщо сцена так і не намалювала кадр (вкладку не відкрили, збій), заглушка не «дихає» вічно.
  useEffect(() => {
    if (!waiting || shown) return;
    const id = setTimeout(() => setShown(true), 8000);
    return () => clearTimeout(id);
  }, [waiting, shown]);

  return { waiting, mounted, shown, show: () => setShown(true) };
}

/**
 * Поле частинок для `/welcome` і `/login` (ADR 0007, DESIGN.md `ParticleField`): декор (`aria-hidden`, без подій
 * миші — курсор і палець слухає сама сцена на `window`). Повне поле — від `lg` з мишею, легке — вужче чи на дотику
 * (ADR 0008, пункт 10, `fieldTier`); без WebGL2, з prefers-reduced-motion, а легке ще й з Save-Data чи на слабкому
 * пристрої three не вантажиться — лишається тло з крапок, і пляма-заглушка не з'являється.
 *
 * Очікування — частина появи: чанк починає вантажитись одразу після гідратації (легке — після `load`), а поки сцени
 * ще немає, на місці аркуша тихо «дихає» пляма з точок. Сцена малює перший кадр — пляма згасає, а точки злітаються на
 * її місце.
 */
export function ParticleField({ variant, className }: { variant: FieldVariant; className?: string }) {
  const [tier, layout] = useFieldTier();
  const loaded = useSyncExternalStore(subscribeLoad, isLoaded, loadedOnServer);
  const on = tier !== "none";
  const known = useSyncExternalStore(noSubscribe, onClient, onServer);
  const { waiting, mounted, shown, show } = useSceneMount(tier === "full" || (tier === "light" && loaded));
  const [ghostGone, setGhostGone] = useState(false);

  // Поле, що стало непотрібним (увімкнули reduced motion), розмонтовуємо — сцена звільняє контекст WebGL. Зміна рівня
  // чи розкладки (вікно перетнуло `lg`, підключили мишу) перебудовує сцену з новою кількістю точок і формами.
  return (
    <div
      aria-hidden="true"
      data-field-tier={known ? tier : undefined}
      className={cn("pointer-events-none", !on && "hidden", className)}
    >
      {waiting && !ghostGone && (
        <div
          onTransitionEnd={() => shown && setGhostGone(true)}
          className={cn(
            "absolute transition-opacity duration-(--duration-slow) ease-out",
            GHOST[layout][variant],
            shown ? "opacity-0" : "opacity-100",
          )}
        >
          {/* Пульс зупиняється, щойно точки почали злітатись: разом з появою — не більше двох рухів. */}
          <div className={cn("field-ghost size-full", !shown && "animate-pulse-slow")} />
        </div>
      )}
      {mounted && on && <ParticleScene variant={variant} tier={tier} layout={layout} onReady={show} />}
    </div>
  );
}
