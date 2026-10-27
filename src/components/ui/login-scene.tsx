"use client";

import { useEffect, useRef } from "react";
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

/**
 * 3D на сторінці входу (ADR 0006, DESIGN.md, розділ 11): стос карток-днів календаря праворуч від форми. Повільно
 * погойдується, нахиляється за курсором, при наведенні розходиться віялом. Кольори — з CSS-токенів, обидві теми.
 *
 * Бережливо: лише на /login і лише після першого відмальовування (next/dynamic у LoginHero); з three — лише потрібні
 * класи; щільність пікселів ≤ 1.5; без тіней; одна геометрія на всі картки; рендер зупиняється, коли вкладку сховано
 * чи сцена поза екраном; prefers-reduced-motion — один статичний кадр; без WebGL — нічого (лишається CSS-фон);
 * при розмонтуванні все звільняється.
 */

/** Дні на картках: число, день тижня й статус словом — як у застосунку (сцена — декор, зчитувач екрана її не бачить). */
const DAYS = [
  { day: 3, weekday: "Tue", status: "approved" },
  { day: 4, weekday: "Wed", status: "awaiting" },
  { day: 5, weekday: "Thu", status: null },
  { day: 6, weekday: "Fri", status: "approved" },
  { day: 7, weekday: "Sat", status: "off" },
] as const;

const CARD = { width: 1.5, height: 1.8, depth: 0.04 };
/** Віяло: крок між картками й зменшення стосу (щоб не зайти під форму); половина його ширини — для зони наведення. */
const FAN = { step: 0.85, shrink: 0.3 };
const FAN_HALF_WIDTH = (2 * (0.08 + FAN.step) + CARD.width / 2) * (1 - FAN.shrink) + 0.1;
const TEXTURE = { width: 300, height: 360 };

type Palette = Record<
  "card" | "foreground" | "muted" | "border" | "primary" | "approved" | "approvedFg" | "awaiting" | "awaitingFg",
  string
>;

/** Значення токенів як рядки CSS (`oklch(…)`): canvas 2D розуміє їх сам. */
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    card: v("--card"),
    foreground: v("--foreground"),
    muted: v("--muted-foreground"),
    border: v("--border"),
    primary: v("--primary"),
    approved: v("--status-approved"),
    approvedFg: v("--status-approved-foreground"),
    awaiting: v("--status-awaiting"),
    awaitingFg: v("--status-awaiting-foreground"),
  };
}

/** Колір токена для матеріалу three: canvas перетворює oklch на sRGB, звідти читаємо піксель. */
function toColor(css: string, probe: CanvasRenderingContext2D): Color {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return new Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
}

function drawCard(ctx: CanvasRenderingContext2D, day: (typeof DAYS)[number], p: Palette, font: string) {
  const { width: w, height: h } = TEXTURE;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = p.card;
  ctx.fillRect(0, 0, w, h);
  // Штриховка — день, закритий школою (DESIGN.md, розділ 6).
  if (day.status === "off") {
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 6;
    for (let x = -h; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
  }
  // Кільця відривного календаря.
  ctx.fillStyle = p.primary;
  ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = p.card;
  for (const x of [w * 0.3, w * 0.7]) {
    ctx.beginPath();
    ctx.arc(x, 27, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = p.muted;
  ctx.font = `600 34px ${font}`;
  ctx.fillText(`${day.weekday} · Nov`, w / 2, 112);
  ctx.fillStyle = day.status === "off" ? p.muted : p.foreground;
  ctx.font = `600 132px ${font}`;
  ctx.fillText(String(day.day), w / 2, 248);
  if (day.status === "approved" || day.status === "awaiting") {
    const [bg, fg] = day.status === "approved" ? [p.approved, p.approvedFg] : [p.awaiting, p.awaitingFg];
    ctx.fillStyle = bg;
    ctx.beginPath();
    const label = day.status === "approved" ? "Approved" : "Awaiting decision";
    ctx.font = `600 22px ${font}`;
    const pill = ctx.measureText(label).width + 56;
    ctx.roundRect(w / 2 - pill / 2, 286, pill, 42, 21);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(w / 2 - pill / 2 + 22, 307, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillText(label, w / 2 - pill / 2 + 36, 315);
  }
}

export default function LoginScene() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // Без WebGL — лишається CSS-фон входу.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0, 13);
    scene.add(new AmbientLight(0xffffff, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(-3, 4, 6);
    scene.add(sun);

    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const font = getComputedStyle(document.body).fontFamily || "sans-serif";
    const geometry = new BoxGeometry(CARD.width, CARD.height, CARD.depth);
    const edge = new MeshLambertMaterial();
    const canvases = DAYS.map(() => Object.assign(document.createElement("canvas"), TEXTURE));
    const textures = canvases.map((c) => {
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    });
    // Лицьова грань без світла — кольори точно як токени; світло лише на гранях дає глибину стосу.
    const faces = textures.map((map) => new MeshBasicMaterial({ map }));

    const stack = new Group();
    const cards = DAYS.map((_, i) => {
      // Лицьова сторона — текстура дня; решта граней — колір картки.
      const mesh = new Mesh(geometry, [edge, edge, edge, edge, faces[i], edge]);
      stack.add(mesh);
      return mesh;
    });
    scene.add(stack);

    function paint() {
      const p = readPalette();
      edge.color.copy(toColor(p.card, probe));
      DAYS.forEach((day, i) => {
        drawCard(canvases[i].getContext("2d")!, day, p, font);
        textures[i].needsUpdate = true;
      });
    }
    paint();
    let disposed = false;
    // Geist від next/font міг ще не довантажитись — тоді текстури перемальовуються, щойно шрифти готові.
    document.fonts.ready.then(() => {
      if (disposed) return;
      paint();
      wake();
    });

    // Розмір і місце стосу: праворуч від картки входу, на ~80% ширини. Вужче за 1100 px місця біля форми немає —
    // тоді сцени не видно (мобільна верстка поза межами продукту, DESIGN.md §1).
    let baseScale = 1;
    let box = el.getBoundingClientRect();
    let roomy = true;
    function resize() {
      const { clientWidth: w, clientHeight: h } = el!;
      box = el!.getBoundingClientRect();
      roomy = w >= 1100;
      renderer.domElement.style.display = roomy ? "" : "none";
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      const visibleHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
      const visibleWidth = visibleHeight * camera.aspect;
      stack.position.set(visibleWidth * 0.31, -visibleHeight * 0.04, 0);
      baseScale = Math.min(1, visibleWidth / 12);
    }
    resize();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = new Vector2(0, 0);
    const raycaster = new Raycaster();
    const plane = new Plane(new Vector3(0, 0, 1), 0);
    const hit = new Vector3();
    let spread = 0;
    let tiltX = 0;
    let tiltY = 0;
    let hover = false;
    // Картка під курсором у віялі піднімається й виходить уперед; lift — плавна частка підйому для кожної.
    let lifted = -1;
    const lift = DAYS.map(() => 0);
    let frame = 0;
    let visible = true;
    const start = performance.now();

    // Тривалості — з токенів (DESIGN.md, розділ 11): згасання переходів — за --duration-base, погойдування — один
    // цикл за --duration-ambient.
    const css = getComputedStyle(document.documentElement);
    const ms = (name: string, fallback: number) => {
      const raw = css.getPropertyValue(name).trim();
      const value = Number.parseFloat(raw) * (raw.endsWith("ms") ? 1 : 1000);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const ease = ms("--duration-base", 200) * 0.6;
    const ambient = ms("--duration-ambient", 18000) / 1000;

    let last = performance.now();
    function place(now: number) {
      const t = (now - start) / 1000;
      // Згасання за часом, а не за кадрами: на повільній машині віяло так само розходиться за ~0.5 с.
      const k = reduced.matches ? 1 : 1 - Math.exp(-Math.min(now - last, 100) / ease);
      last = now;
      // prefers-reduced-motion — стан спокою, навіть якщо його ввімкнули, поки курсор був над стосом.
      const still = reduced.matches;
      spread += ((!still && hover ? 1 : 0) - spread) * k;
      tiltX += ((still ? 0 : pointer.y * 0.18) - tiltX) * k;
      tiltY += ((still ? 0 : pointer.x * 0.28) - tiltY) * k;
      const sway = reduced.matches ? 0 : Math.sin((t / ambient) * Math.PI * 2) * 0.18;
      stack.rotation.set(-0.12 + tiltX, -0.42 + sway + tiltY, 0.04);
      // У віялі стос трохи менший, щоб не зайти під форму входу.
      stack.scale.setScalar(baseScale * (1 - FAN.shrink * spread));
      const n = cards.length;
      cards.forEach((card, i) => {
        const o = i - (n - 1) / 2;
        lift[i] += ((!still && i === lifted && hover ? 1 : 0) - lift[i]) * k;
        // Стос: картки одна за одною; віяло: розходяться по дузі так, що число кожної видно. Наведена картка лише
        // піднімається й вирівнюється у своїй площині — без руху вперед: картки лежать у паралельних площинах на різній
        // глибині, тож не проходять одна крізь одну.
        card.position.set(
          o * (0.08 + FAN.step * spread),
          -Math.abs(o) * 0.14 * spread + lift[i] * 0.95 * spread,
          -i * 0.16,
        );
        card.rotation.set(0, 0, -o * (0.035 + 0.1 * spread) * (1 - lift[i] * 0.7));
      });
    }

    function render(now: number) {
      place(now);
      renderer.render(scene, camera);
    }

    const live = () => roomy && visible && !document.hidden;

    function loop(now: number) {
      render(now);
      frame = live() && !reduced.matches ? requestAnimationFrame(loop) : 0;
    }

    // prefers-reduced-motion — один статичний кадр: без циклу, курсора й віяла; перемальовуємо лише після зміни теми,
    // шрифту чи розміру.
    function wake() {
      if (!live()) return;
      if (reduced.matches) render(performance.now());
      else if (!frame) frame = requestAnimationFrame(loop);
    }

    const local = new Vector3();
    function onPointer(event: PointerEvent) {
      if (reduced.matches || !live()) return;
      const x = Math.min(1, Math.max(-1, ((event.clientX - box.left) / box.width) * 2 - 1));
      const y = Math.min(1, Math.max(-1, -((event.clientY - box.top) / box.height) * 2 + 1));
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        // Відкривається віяло наведенням на сам стос у спокої — щоб не відкриватись від руху над формою; відкрите
        // тримається, поки курсор над будь-якою з розведених карток.
        local.copy(hit).sub(stack.position).divideScalar(baseScale);
        const halfWidth = hover ? FAN_HALF_WIDTH : CARD.width * 0.75;
        hover = Math.abs(local.x) < halfWidth && Math.abs(local.y) < CARD.height * 0.6;
      }
      // Яку картку піднімати: найближча до камери, в яку влучає курсор, — лише коли віяло вже розійшлось.
      lifted = -1;
      if (hover && spread > 0.5) {
        const [first] = raycaster.intersectObjects(cards, false);
        if (first) lifted = cards.findIndex((card) => card === first.object);
      }
    }

    function onLeave(event: PointerEvent) {
      if (event.relatedTarget === null) {
        hover = false;
        lifted = -1;
        pointer.set(0, 0);
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    observer.observe(el);
    const themeObserver = new MutationObserver(() => {
      paint();
      wake();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      paint();
      wake();
    };
    const sizeObserver = new ResizeObserver(() => {
      resize();
      wake();
    });
    sizeObserver.observe(el);
    scheme.addEventListener("change", onScheme);
    reduced.addEventListener("change", wake);
    window.addEventListener("pointermove", onPointer);
    document.addEventListener("pointerout", onLeave);
    document.addEventListener("visibilitychange", wake);
    wake();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      sizeObserver.disconnect();
      themeObserver.disconnect();
      scheme.removeEventListener("change", onScheme);
      reduced.removeEventListener("change", wake);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerout", onLeave);
      document.removeEventListener("visibilitychange", wake);
      geometry.dispose();
      edge.dispose();
      faces.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  // z-1 — над сіткою з крапок (.login-hero::after), під формою входу (z-10).
  return <div ref={host} aria-hidden="true" className="pointer-events-none absolute inset-0 z-1" />;
}
