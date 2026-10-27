"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChartColumn, ClipboardCheck, House, List, Plus } from "lucide-react";
import { markHydrated } from "@/components/ui/motion";
import { highlightTarget } from "@/lib/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: ReactNode; deciders?: true }[] = [
  { href: "/", label: "Overview", icon: <House /> },
  { href: "/requests/new", label: "New request", icon: <Plus /> },
  { href: "/requests", label: "My requests", icon: <List /> },
  { href: "/decisions", label: "Decisions", icon: <ClipboardCheck />, deciders: true },
  { href: "/balances", label: "Balances", icon: <ChartColumn /> },
];

/**
 * Іконка пункту, а поки перехід на його сторінку ще чекає сервера — спінер на її місці (useLinkStatus). Спінер
 * з'являється лише через 100 ms, щоб швидкий перехід не блимав; розмір той самий, тож рядок не зсувається.
 */
function NavIcon({ icon }: { icon: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="relative grid size-4 shrink-0 place-items-center">
      <span className={cn("contents", pending && "*:animate-pending-out")}>{icon}</span>
      {pending && (
        <span aria-hidden="true" className="absolute inset-0.5 animate-pending-in">
          <span className="block size-full rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
        </span>
      )}
      {/* Спінер зчитувач екрана не бачить; про очікування каже постійна жива область (DESIGN.md, розділ 7). */}
      <span role="status" className="sr-only">
        {pending ? "Loading…" : ""}
      </span>
    </span>
  );
}

/** Лічильник пункту: у розгорнутій панелі — праворуч у рядку, у згорнутій — маленька «пігулка» на іконці. */
function Counter({ value, label, collapsed, className }: { value: number; label: string; collapsed: boolean; className: string }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full font-semibold tabular-nums",
        collapsed
          ? "absolute top-0.5 left-6 h-4 min-w-4 px-1 text-[11px] leading-none ring-2 ring-sidebar"
          : "ml-auto h-5 min-w-5 px-1.5 text-[11px]",
        className,
      )}
    >
      {value}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

/**
 * canDecide — роль manager чи admin: лише їм пункт «Decisions» (матриця прав requirements/product.md). Лічильники:
 * у «My requests» — власні записи, що чекають рішення; у «Decisions» — ті, що чекають рішення цього користувача
 * (на primary, DESIGN.md, AppNav). `collapsed` — згорнута панель: лише іконки, назва — у підказці й для зчитувача
 * екрана (текст лишається в посиланні, лише прозорий), посилання працюють так само.
 */
export function SidebarNav({
  awaiting,
  toDecide,
  canDecide,
  collapsed,
}: {
  awaiting: number;
  toDecide: number;
  canDecide: boolean;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const location = search ? `${pathname}?${search}` : pathname;
  // Підсвітка — одна смуга під пунктами, що плавно їде до натиснутого одразу, ще до відповіді сервера (DESIGN.md,
  // розділ 11). `clicked` — куди їде зараз; після переходу знову йде за адресою.
  const [clicked, setClicked] = useState<{ href: string; from: string } | null>(null);
  // Адреса змінилась (перехід завершився, «Назад», redirect після подання, інший перехід перебив цей — наприклад,
  // зміна року на /balances) — натиснутий пункт уже не потрібен.
  const [seen, setSeen] = useState(location);
  if (seen !== location) {
    setSeen(location);
    setClicked(null);
  }
  const target = highlightTarget(clicked, location, pathname);

  // Перший рендер застосунку позаду: далі CountUp «докручує» числа після переходів (motion.tsx).
  useEffect(() => markHydrated(), []);
  const nav = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ top: number; height: number; animate: boolean } | null>(null);

  useLayoutEffect(() => {
    const link = nav.current?.querySelector<HTMLElement>(`[data-href="${target}"]`);
    // Перший замір — без руху: смуга просто стає на місце підсвітки з розмітки сервера.
    setBox((was) => (link ? { top: link.offsetTop, height: link.offsetHeight, animate: was !== null } : null));
  }, [target, collapsed]);

  return (
    <nav ref={nav} aria-label="Main" className="relative flex flex-col gap-0.5">
      {box && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 top-0 rounded-md bg-sidebar-accent",
            box.animate && "transition-transform duration-(--duration-base) ease-out",
          )}
          style={{ height: box.height, transform: `translateY(${box.top}px)` }}
        />
      )}
      {LINKS.filter((l) => !l.deciders || canDecide).map(({ href, label, icon }) => {
        const active = target === href;
        return (
          <Tooltip key={href} disabled={!collapsed}>
            <TooltipTrigger
              render={
                <Link
                  href={href}
                  data-href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={(event) => {
                    const plain = !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0;
                    if (plain && !event.defaultPrevented) setClicked({ href, from: location });
                  }}
                  className={cn(
                    "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-out [&_svg]:size-4 [&_svg]:shrink-0",
                    active
                      ? // Поки смугу не виміряно (розмітка сервера), підсвітку дає сам пункт.
                        cn("text-sidebar-accent-foreground", !box && "bg-sidebar-accent")
                      : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                />
              }
            >
              <NavIcon icon={icon} />
              <span
                className={cn(
                  "transition-opacity duration-(--duration-fast) ease-out",
                  collapsed && "pointer-events-none opacity-0",
                )}
              >
                {label}
              </span>
              {href === "/requests" && awaiting > 0 && (
                <Counter
                  value={awaiting}
                  label="awaiting decision"
                  collapsed={collapsed}
                  className="bg-status-awaiting text-status-awaiting-foreground"
                />
              )}
              {href === "/decisions" && toDecide > 0 && (
                <Counter
                  value={toDecide}
                  label="awaiting your decision"
                  collapsed={collapsed}
                  className="bg-primary text-primary-foreground"
                />
              )}
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
