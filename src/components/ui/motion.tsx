"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { countUpText } from "@/lib/motion";
import { cn } from "@/lib/utils";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Тривалість із токена руху (DESIGN.md, розділ 11), у мілісекундах. */
function tokenMs(name: "--duration-slow" | "--duration-showcase", fallback: number) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return Number.parseFloat(value) || fallback;
}

function slowMs() {
  return tokenMs("--duration-slow", 420);
}

/**
 * Перший рендер застосунку показав сторінку й числа з сервера — анімуємо лише те, що з'явилось після переходу.
 * Позначає бічна панель (вона є на кожній сторінці), коли перший рендер позаду.
 */
let hydrated = false;
export function markHydrated() {
  setTimeout(() => (hydrated = true));
}
export function isHydrated() {
  return hydrated;
}

/**
 * Число, що «докручується» від нуля до значення, коли картка з'являється після переходу (DESIGN.md, розділ 11). Лише
 * при першій появі: зміна `?year=` чи працівника на тій самій сторінці показує нове число одразу. Без
 * prefers-reduced-motion. Зчитувач екрана читає готове значення; цифри, що біжать, від нього сховано.
 */
export function CountUp({ value, decimals = 2 }: { value: string; decimals?: number }) {
  const target = Number(value);
  const [shown, setShown] = useState(value);
  const [synced, setSynced] = useState(value);
  // Нове значення від сервера після появи — показуємо як є.
  if (synced !== value) {
    setSynced(value);
    setShown(value);
  }
  const frame = useRef(0);

  // Нове значення посеред анімації — зупиняємо її: інакше наступний кадр записав би число зі старого значення.
  useLayoutEffect(() => () => cancelAnimationFrame(frame.current), [value]);

  // Layout-ефект: нуль стоїть уже в першому кадрі картки, без спалаху готового числа.
  useLayoutEffect(() => {
    if (!hydrated || !Number.isFinite(target) || reducedMotion()) return;
    setShown((0).toFixed(decimals));
    const duration = slowMs();
    const start = performance.now();
    frame.current = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setShown(t < 1 ? countUpText(target, t, decimals) : value);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame.current);
      setShown(value);
    };
    // Лише при появі картки: нове значення пізніше показує синхронізація вище.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}

const MAX_TILT_DEG = 2;

/**
 * Картка, що ледь нахиляється за курсором — не більше ніж на 2° (DESIGN.md, розділ 11). Лише миша й лише без
 * prefers-reduced-motion; на дотик і клавіатуру не впливає.
 */
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const el = useRef<HTMLDivElement>(null);

  function tilt(event: PointerEvent<HTMLDivElement>) {
    const node = el.current;
    if (!node || event.pointerType !== "mouse" || reducedMotion()) return;
    const box = node.getBoundingClientRect();
    const x = Math.min(0.5, Math.max(-0.5, (event.clientX - box.left) / box.width - 0.5));
    const y = Math.min(0.5, Math.max(-0.5, (event.clientY - box.top) / box.height - 0.5));
    node.style.transform = `perspective(800px) rotateX(${(-y * 2 * MAX_TILT_DEG).toFixed(2)}deg) rotateY(${(x * 2 * MAX_TILT_DEG).toFixed(2)}deg)`;
  }

  function reset() {
    if (el.current) el.current.style.transform = "";
  }

  return (
    <div
      ref={el}
      onPointerMove={tilt}
      onPointerLeave={reset}
      className={cn("transition-transform duration-(--duration-fast) ease-out", className)}
    >
      {children}
    </div>
  );
}

/**
 * Число, що ледь підскакує, коли змінюється на місці (ADR 0007: лічильники після рішення). Перше відмальовування —
 * без руху; reduced motion вимикає анімацію в globals.css.
 */
export function Tick({ value, className }: { value: number | string; className?: string }) {
  const [first] = useState(value);
  return (
    <span key={String(value)} className={cn("inline-block", value !== first && "animate-tick", className)}>
      {value}
    </span>
  );
}

/**
 * Велике число landing, що «докручується» від нуля за `--duration-showcase`, коли більша його частина заходить в
 * екран (ADR 0007; лише `/welcome`). Сервер віддає готове число — без JS воно й лишається; reduced motion і браузер без
 * IntersectionObserver теж показують його одразу. Зчитувач екрана читає готове значення.
 */
export function ShowcaseCount({ value, decimals = 2 }: { value: string; decimals?: number }) {
  const [shown, setShown] = useState(value);
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = el.current;
    const target = Number(value);
    if (!node || !Number.isFinite(target) || reducedMotion() || !("IntersectionObserver" in window)) return;
    let frame = 0;
    // Нуль ставимо до того, як число зайде в екран.
    setShown((0).toFixed(decimals));
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const duration = tokenMs("--duration-showcase", 1200);
        const start = performance.now();
        frame = requestAnimationFrame(function tick(now) {
          const t = Math.min(1, (now - start) / duration);
          setShown(t < 1 ? countUpText(target, t, decimals) : value);
          if (t < 1) frame = requestAnimationFrame(tick);
        });
      },
      { threshold: 0.6 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, decimals]);

  return (
    <span ref={el}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
