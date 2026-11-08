"use client";

import { useEffect, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  CustomBlending,
  GLSL3,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  RawShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  approach,
  buildField,
  FORM_COUNT,
  PALETTE_TOKENS,
  stageAt,
  tierBudget,
  type FieldLayout,
  type FieldTier,
  type FieldVariant,
} from "@/lib/particle-field";
import { FRAGMENT, VERTEX } from "./particle-shaders";

/**
 * Сцена поля частинок на three.js (ADR 0007): один `Points`, свої шейдери, один draw call, без тіней і постобробки.
 * Вантажиться окремим чанком лише на `/welcome` і `/login` (через ParticleField). Повне поле — щільність пікселів
 * ≤ 1.5, легке (ADR 0008) — до 6 000 точок і щільність 1, той самий шейдер; рендер стоїть, коли вкладку сховано чи
 * полотно поза екраном; prefers-reduced-motion — статичний кадр без циклу; кольори — з токенів теми; при
 * розмонтуванні все звільняється. Точки розштовхує миша, а на дотику — палець, і під час прокрутки.
 */

interface VariantConfig {
  depth: number;
  /** Нахил камери для кожної форми (landing) або один (вхід). */
  yaw: readonly number[];
  pitch: readonly number[];
}

const CONFIG: Record<FieldVariant, VariantConfig> = {
  welcome: { depth: 4.1, yaw: [-0.42, 0.28, 0, 0, 0], pitch: [-0.18, -0.1, 0, 0.05, 0.38] },
  login: { depth: 3.4, yaw: [-0.38], pitch: [-0.14] },
};

/** Поява поля: точки злітаються з розсипу й проявляються за 1.6 с (на вході — у аркуш, на landing — у поточну форму). */
const INTRO_SECONDS = 1.6;
const OFF = 9;
/** Курсор «ніде»: поза полотном, точки від нього не відштовхуються. */
const FAR = new Vector2(OFF, OFF);

const reducedQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");

/** Один цикл погойдування поля — токен `--duration-ambient` (DESIGN.md, розділ 11), у секундах. */
function ambientSeconds() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--duration-ambient").trim();
  const value = Number.parseFloat(raw) / (raw.endsWith("ms") ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? value : 18;
}

/** Значення кута для дробової стадії: лінійно між сусідніми формами. */
function along(values: readonly number[], stage: number) {
  if (values.length === 1) return values[0];
  const i = Math.min(values.length - 2, Math.floor(stage));
  return values[i] + (values[i + 1] - values[i]) * (stage - i);
}

/** Кольори токенів у sRGB 0..1: canvas 2D перетворює oklch сам, звідти читаємо піксель. */
function readPalette(probe: CanvasRenderingContext2D) {
  const css = getComputedStyle(document.documentElement);
  const rgb = (value: string) => {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return new Vector3(r / 255, g / 255, b / 255);
  };
  const colors = PALETTE_TOKENS.map((token) => rgb(css.getPropertyValue(token).trim()));
  const bg = rgb(css.getPropertyValue("--background").trim());
  // Світла тема — темні частинки на світлому тлі (звичайне змішування), темна — світлі (адитивне).
  const dark = 0.2126 * bg.x + 0.7152 * bg.y + 0.0722 * bg.z < 0.5;
  return { colors, dark };
}

function createPoints(variant: FieldVariant, count: number, layout: FieldLayout) {
  const field = buildField(variant, count, layout);
  const geometry = new BufferGeometry();
  const names = ["position", "p1", "p2", "p3", "p4"];
  for (let s = 0; s < FORM_COUNT; s++) {
    geometry.setAttribute(names[s], new BufferAttribute(field.positions[s], 3));
    geometry.setAttribute(`t${s}`, new BufferAttribute(field.tones[s], 2));
  }
  geometry.setAttribute("aR", new BufferAttribute(field.random, 4));
  geometry.setAttribute("aK", new BufferAttribute(field.group, 1));
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    uniforms: {
      uT: { value: 0 },
      uP: { value: 0 },
      uAspect: { value: 1 },
      uMotion: { value: 1 },
      uDpr: { value: 1 },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uFocus: { value: -1 },
      uIntro: { value: 0 },
      uDepth: { value: CONFIG[variant].depth },
      uMouse: { value: new Vector2(OFF, OFF) },
      uPal: { value: PALETTE_TOKENS.map(() => new Vector3()) },
    },
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { geometry, material, points };
}

/** Верх елемента на сторінці за розкладкою (offsetTop), без transform: поява секції (.welcome-reveal) не зсуває межі форм. */
function pageTop(el: HTMLElement) {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

/** Секції landing, що задають форму поля (`data-field-stage`), — верхи на сторінці. */
function sectionTops() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-field-stage]"), pageTop);
}

/** Зміна щільності пікселів (вікно перейшло на інший монітор): ResizeObserver її не бачить. */
function watchPixelRatio(onChange: () => void) {
  let query: MediaQueryList | null = null;
  const listen = () => {
    query?.removeEventListener("change", changed);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", changed);
  };
  function changed() {
    onChange();
    listen();
  }
  listen();
  return () => query?.removeEventListener("change", changed);
}

export default function ParticleScene({
  variant,
  tier,
  layout,
  onReady,
}: {
  variant: FieldVariant;
  tier: Exclude<FieldTier, "none">;
  layout: FieldLayout;
  onReady?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  // Свіжий onReady без перезапуску сцени: ефект нижче не залежить від нього.
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    } catch {
      // Контекст не створився (ліміт контекстів, збій GPU): лишається тло з крапок, а плямку-заглушку гасимо.
      readyRef.current?.();
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);
    const camera = new Camera();
    const budget = tierBudget(tier, variant);
    const { geometry, material, points } = createPoints(variant, budget.points, layout);
    const u = material.uniforms;
    const config = CONFIG[variant];
    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

    const paint = () => {
      if (!probe) return;
      const { colors, dark } = readPalette(probe);
      colors.forEach((c, i) => (u.uPal.value[i] as Vector3).copy(c));
      material.blendDst = dark ? OneFactor : OneMinusSrcAlphaFactor;
    };
    paint();

    const state = { stage: 0, target: 0, time: 0, focus: -1 };
    const mouse = { at: new Vector2(OFF, OFF), smooth: new Vector2(OFF, OFF), gaze: new Vector2(), gazeSmooth: new Vector2() };
    let box = el.getBoundingClientRect();
    let boxDirty = false;
    let visible = true;
    let frame = 0;
    let last = performance.now();
    // Початок появи — перший намальований кадр, а не монтування: інакше після затримки точки вже стояли б на місці.
    let born = last;
    let announced = false;
    const reduced = reducedQuery();
    const sway = (2 * Math.PI) / ambientSeconds();

    const resize = () => {
      box = el.getBoundingClientRect();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.pixelRatio));
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      u.uAspect.value = el.clientWidth / Math.max(1, el.clientHeight);
      u.uDpr.value = renderer.getPixelRatio();
    };
    resize();

    // Верхи секцій кешуємо: перераховуємо, лише коли змінилась розкладка сторінки, а не на кожну подію прокрутки.
    let tops = variant === "welcome" ? sectionTops() : [];
    const measure = () => {
      if (variant === "welcome") state.target = stageAt(tops, window.scrollY, window.innerHeight * 0.55);
    };
    measure();
    // Сторінка відкрилась уже прокрученою (#roles, відновлена прокрутка) — поле одразу в потрібній формі, без
    // пробігу через усі попередні.
    state.stage = state.target;

    const draw = (now: number) => {
      if (!announced) born = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const still = reduced.matches;
      // Поява — за реальний час від появи сцени, а не за кількість кадрів; reduced motion — одразу на місці.
      u.uIntro.value = still ? 1 : Math.min(1, (now - born) / 1000 / INTRO_SECONDS);
      state.stage = still ? state.target : approach(state.stage, state.target, dt, 2.4);
      if (!still) state.time += dt;
      const outside = Math.abs(mouse.at.x) > 5;
      // Згладжування курсора за часом, а не за кадрами: однаково на 60 і 144 Гц.
      mouse.smooth.lerp(mouse.at, outside || Math.abs(mouse.smooth.x) > 5 ? 1 : 1 - Math.exp(-dt * 21));
      mouse.gazeSmooth.lerp(mouse.gaze, Math.min(1, dt * 3));
      const motion = still ? 0 : 1;
      u.uT.value = state.time;
      u.uP.value = state.stage;
      u.uMotion.value = motion;
      u.uFocus.value = state.focus;
      u.uYaw.value = along(config.yaw, state.stage) + motion * (0.06 * Math.sin(state.time * sway) + mouse.gazeSmooth.x * 0.16);
      u.uPitch.value = along(config.pitch, state.stage) - motion * mouse.gazeSmooth.y * 0.1;
      (u.uMouse.value as Vector2).copy(still ? FAR : mouse.smooth);
      renderer.render(points, camera);
      // Перший кадр намальовано (ще прозорий: uIntro = 0, точки лише починають злітатись) — ParticleField гасить
      // плямку-заглушку, і вона перетікає в появу точок.
      if (!announced) {
        announced = true;
        readyRef.current?.();
      }
    };

    const live = () => visible && !document.hidden;
    const loop = (now: number) => {
      frame = 0;
      if (!live()) return;
      draw(now);
      if (!reduced.matches) frame = requestAnimationFrame(loop);
    };
    // Розбудити цикл; з reduced motion — один кадр на зміну (тема, розмір, прокрутка).
    const wake = () => {
      if (!live() || frame) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    /** Точка екрана → координати полотна; поза полотном точки від неї не відштовхуються. `lean` — наскільки поле
     * повертається за нею (палець — удвічі менше, ніж миша). */
    const aim = (clientX: number, clientY: number, lean: number) => {
      if (boxDirty) {
        box = el.getBoundingClientRect();
        boxDirty = false;
      }
      const x = ((clientX - box.left) / box.width) * 2 - 1;
      const y = -(((clientY - box.top) / box.height) * 2 - 1);
      const inside = Math.abs(x) <= 1 && Math.abs(y) <= 1;
      mouse.at.set(inside ? x : OFF, inside ? y : OFF);
      mouse.gaze.set(inside ? x * lean : 0, inside ? y * lean : 0);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "mouse") aim(event.clientX, event.clientY, 1);
    };
    // Дотик (ADR 0008): pointermove на сенсорному екрані зупиняється, щойно браузер бере жест на прокрутку, а
    // touchmove — ні, тож точки розштовхує палець і під час прокрутки. Обробники пасивні: прокрутку не гальмують.
    const onTouch = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      aim(touch.clientX, touch.clientY, 0.5);
      wake();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length) return;
      mouse.at.set(OFF, OFF);
      mouse.gaze.set(0, 0);
    };
    // Курсор пішов за межі вікна — поле перестає від нього відштовхуватись і повертатись за ним.
    const onPointerGone = (event: Event) => {
      if (event.type === "pointerout" && (event as PointerEvent).relatedTarget !== null) return;
      mouse.at.set(OFF, OFF);
      mouse.gaze.set(0, 0);
    };
    // Наведена картка ролі на landing підсвічує свою сферу (декор для миші: ті самі ролі — у тексті карток).
    const onOver = (event: Event) => {
      const card = (event.target as Element | null)?.closest?.("[data-field-focus]");
      state.focus = card ? Number(card.getAttribute("data-field-focus")) : -1;
    };
    // Межі полотна читаємо ліниво — у наступному русі миші, а не на кожну подію прокрутки.
    const onScroll = () => {
      boxDirty = true;
      measure();
      wake();
    };
    const onTheme = () => {
      paint();
      wake();
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    io.observe(el);
    const sizes = new ResizeObserver(() => {
      resize();
      tops = variant === "welcome" ? sectionTops() : [];
      measure();
      wake();
    });
    sizes.observe(el);
    // Висота сторінки змінюється й без зміни вікна (пісочниця «Try it»): тоді теж перераховуємо межі форм.
    sizes.observe(document.body);
    const stopPixelRatio = watchPixelRatio(() => {
      resize();
      wake();
    });
    // Браузер відновив втрачений контекст WebGL — перемальовуємо (з reduced motion цикл сам не прокинувся б).
    const onRestored = () => {
      paint();
      wake();
    };
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);
    const themes = new MutationObserver(onTheme);
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", onTheme);
    reduced.addEventListener("change", wake);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onPointerGone);
    window.addEventListener("blur", onPointerGone);
    document.addEventListener("visibilitychange", wake);
    wake();

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      sizes.disconnect();
      themes.disconnect();
      scheme.removeEventListener("change", onTheme);
      reduced.removeEventListener("change", wake);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onPointerGone);
      window.removeEventListener("blur", onPointerGone);
      document.removeEventListener("visibilitychange", wake);
      stopPixelRatio();
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [variant, tier, layout]);

  return <div ref={host} className="size-full" />;
}
