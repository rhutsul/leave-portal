"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecisionStamp, type StampStatus } from "@/components/ui/decision-stamp";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RECORD_STATUSES } from "@/lib/leave/request";
import { cn } from "@/lib/utils";

/** Рух рішення в панелі (ADR 0007): печатка, потім уся панель запису ковзає вгору. */
interface SheetMotion {
  stamp: (status: StampStatus) => void;
  leave: () => void;
}

const SheetMotionContext = createContext<SheetMotion>({ stamp: () => {}, leave: () => {} });

export function useSheetMotion() {
  return useContext(SheetMotionContext);
}

/** Набраний, але не надісланий коментар менеджера в панелі. */
function hasDraft(popup: Element | null) {
  return Boolean(popup?.querySelector<HTMLTextAreaElement>("textarea")?.value.trim());
}

/** Звідки з'являється інший запис: «Next» і наступний після рішення — знизу, «Previous» — згори. */
type Direction = "next" | "prev";

/** Клавіша в шапці панелі → куди перейти: ↑ — попередній запис, ↓ — наступний; з модифікаторами — нікуди. */
function keyTarget(event: KeyboardEvent): Direction | null {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "ArrowUp") return "prev";
  return event.key === "ArrowDown" ? "next" : null;
}

const NAV_LABEL: Record<Direction, string> = { prev: "Previous record", next: "Next record" };

/**
 * Шапка перемонтовується з кожним записом, тож кнопка «Previous / Next», на якій стояв фокус, зникає, і з клавіатури
 * далі не погортати. Після переходу повертаємо фокус на ту саму кнопку нового запису (або на другу, якщо ця вимкнена),
 * але лише якщо фокус «загубився» — на `body` чи на самій панелі, куди його переносить Base UI, — а не користувач
 * переставив його сам.
 */
function useNavFocus(recordKey: number | string | undefined) {
  const pending = useRef<Direction | null>(null);
  useEffect(() => {
    const to = pending.current;
    pending.current = null;
    if (to) restoreNavFocus(to);
  }, [recordKey]);
  return (to: Direction) => {
    pending.current = to;
  };
}

/** Кнопка «Previous / Next» у шапці відкритої панелі; вимкнена не годиться. */
function navButton(popup: Element | null, direction: Direction) {
  const selector = `[data-slot="sheet-header"] [aria-label="${NAV_LABEL[direction]}"]:not(:disabled)`;
  return popup?.querySelector<HTMLButtonElement>(selector) ?? null;
}

function restoreNavFocus(to: Direction) {
  const popup = document.querySelector('[data-slot="sheet-content"]');
  const lost = [null, document.body, popup].includes(document.activeElement);
  if (!lost) return;
  (navButton(popup, to) ?? navButton(popup, to === "prev" ? "next" : "prev"))?.focus();
}

/** «2 of 6» і «Previous / Next» у шапці панелі. */
function RecordNav({
  position,
  prevHref,
  nextHref,
  go,
}: {
  position: string;
  prevHref: string | null;
  nextHref: string | null;
  go: (direction: Direction) => void;
}) {
  return (
    <>
      <span className="mr-1 text-xs tabular-nums text-muted-foreground">{position}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={NAV_LABEL.prev}
        aria-keyshortcuts="ArrowUp"
        disabled={!prevHref}
        onClick={() => go("prev")}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={NAV_LABEL.next}
        aria-keyshortcuts="ArrowDown"
        disabled={!nextHref}
        onClick={() => go("next")}
      >
        <ChevronDown />
      </Button>
    </>
  );
}

/** Постійна жива область поза рамкою запису: зчитувач екрана оголошує рішення, коли в ній з'являється текст. */
function StampAnnouncer({ stamp }: { stamp: StampStatus | null }) {
  return (
    <span role="status" className="sr-only">
      {stamp ? RECORD_STATUSES[stamp] : ""}
    </span>
  );
}

/**
 * Тіло запису з печаткою над ним. Поки печатку показано, рішення вже збережено: форма недоступна (`inert`), щоб
 * другий клік не надіслав його знову.
 */
function StampedBody({ stamp, children }: { stamp: StampStatus | null; children: ReactNode }) {
  // Та сама структура з печаткою й без, щоб форма в тілі не перемонтовувалась і тіло плавно тьмяніло.
  return (
    <>
      <SheetBody
        inert={stamp !== null}
        // max-md:pb-44 — на телефоні дії рішення прикріплені внизу панелі (ADR 0008): тіло прокручується з-під них.
        className={cn("transition-opacity duration-(--duration-base) ease-out max-md:pb-44", stamp && "opacity-20 blur-xs")}
      >
        {children}
      </SheetBody>
      {stamp && <DecisionStamp status={stamp} className="absolute inset-x-0 top-24 bottom-16" />}
    </>
  );
}

/**
 * Рамка запису в панелі з рухом рішення (ADR 0007): печатка над тілом, виїзд угору, а інший запис у вже відкритій
 * панелі підіймається знизу (після рішення чи «Next») або опускається згори («Previous»). Перший запис — без руху:
 * панель і так виїжджає справа.
 */
function RecordMotion({
  recordKey,
  direction,
  header,
  children,
}: {
  recordKey?: number | string;
  direction: Direction;
  header: ReactNode;
  children: ReactNode;
}) {
  const [stamp, setStamp] = useState<StampStatus | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [shownKey, setShownKey] = useState(recordKey);
  const [arrived, setArrived] = useState(false);
  const [enter, setEnter] = useState<Direction>("next");
  if (shownKey !== recordKey) {
    setShownKey(recordKey);
    setArrived(true);
    // Після рішення (панель якраз виїжджала) наступний запис завжди приходить знизу, хоч би як гортали перед тим.
    setEnter(leaving ? "next" : direction);
    setStamp(null);
    setLeaving(false);
  }
  // Стабільний об'єкт для контексту: setState сталі, тож useMemo без залежностей.
  const motion = useMemo<SheetMotion>(() => ({ stamp: setStamp, leave: () => setLeaving(true) }), []);
  return (
    <SheetMotionContext.Provider value={motion}>
      <StampAnnouncer stamp={stamp} />
      <div
        key={String(recordKey)}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          leaving ? "animate-sheet-out" : arrived && (enter === "prev" ? "animate-sheet-in-down" : "animate-sheet-in"),
        )}
      >
        {header}
        <StampedBody stamp={stamp}>{children}</StampedBody>
      </div>
    </SheetMotionContext.Provider>
  );
}

/**
 * Запис «Decisions» у панелі справа (рішення користувача: список на всю ширину, запис — поверх нього). Відкрита, коли
 * в посиланні є `?record=`; закрити — повернутись до списку вкладки. Esc і клік повз панель не закривають її, поки в
 * полі коментаря є текст: щоб не загубити набране; хрестик закриває завжди. «Previous / Next» і клавіші ↑/↓ (коли
 * фокус у шапці панелі — там він і стоїть після відкриття) переходять між записами списку, не закриваючи панель.
 * Переходи — `replace`: «Назад» у браузері веде зі сторінки, а не по кожному переглянутому запису.
 */
export function RecordSheet({
  title,
  description,
  badge,
  position,
  closeHref,
  prevHref,
  nextHref,
  recordKey,
  children,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  /** "2 of 6" — де цей запис у списку; null — запису немає в списку (відмова чи вже вирішений). */
  position: string | null;
  closeHref: string;
  prevHref: string | null;
  nextHref: string | null;
  /** Id показаного запису: новий запис у тій самій панелі підіймається знизу (ADR 0007). */
  recordKey?: number | string;
  children: ReactNode;
}) {
  const router = useRouter();
  const go = (href: string) => router.replace(href, { scroll: false });
  // Після рішення наступний запис приходить знизу, тож напрямок за замовчуванням — «next».
  const [direction, setDirection] = useState<Direction>("next");
  const keepFocus = useNavFocus(recordKey);
  const step = (to: Direction) => {
    const href = to === "prev" ? prevHref : nextHref;
    if (!href) return;
    setDirection(to);
    keepFocus(to);
    go(href);
  };

  function onHeaderKey(event: KeyboardEvent<HTMLDivElement>) {
    const to = keyTarget(event);
    if (!to || !(to === "prev" ? prevHref : nextHref)) return;
    event.preventDefault();
    step(to);
  }

  const header = (
    <SheetHeader
      onKeyDown={onHeaderKey}
      // Телефон (ADR 0008): панель на весь екран — «назад» ліворуч замість хрестика праворуч, діє так само, як Close.
      leading={
        <Button variant="ghost" size="icon" className="-ml-2 size-11 md:hidden" aria-label="Back to list" onClick={() => go(closeHref)}>
          <ChevronLeft className="size-5" />
        </Button>
      }
      closeClassName="max-md:hidden"
      actions={position && <RecordNav position={position} prevHref={prevHref} nextHref={nextHref} go={step} />}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <SheetTitle>{title}</SheetTitle>
        {badge}
      </div>
      {description && <SheetDescription>{description}</SheetDescription>}
    </SheetHeader>
  );

  return (
    <Sheet
      open
      onOpenChange={(open, details) => {
        if (open) return;
        const popup = document.querySelector('[data-slot="sheet-content"]');
        if ((details.reason === "escape-key" || details.reason === "outside-press") && hasDraft(popup)) {
          details.cancel();
          return;
        }
        go(closeHref);
      }}
    >
      <SheetContent className="overflow-hidden max-md:max-w-none max-md:border-0">
        <RecordMotion recordKey={recordKey} direction={direction} header={header}>
          {children}
        </RecordMotion>
      </SheetContent>
    </Sheet>
  );
}
