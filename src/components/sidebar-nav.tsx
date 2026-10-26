"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChartIcon, DecisionsIcon, HomeIcon, ListIcon, PlusIcon } from "./ui/icons";

const LINKS: { href: string; label: string; icon: ReactNode; deciders?: true }[] = [
  { href: "/", label: "Overview", icon: <HomeIcon /> },
  { href: "/requests/new", label: "New request", icon: <PlusIcon size={18} /> },
  { href: "/requests", label: "My requests", icon: <ListIcon /> },
  { href: "/decisions", label: "Decisions", icon: <DecisionsIcon />, deciders: true },
  { href: "/balances", label: "Balances", icon: <ChartIcon /> },
];

/** canDecide — роль manager чи admin: лише їм пункт «Decisions» (матриця прав requirements/product.md). */
export function SidebarNav({ awaiting, canDecide }: { awaiting: number; canDecide: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {LINKS.filter((l) => !l.deciders || canDecide).map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
              active ? "bg-accent font-medium text-primary" : "text-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {icon}
            {label}
            {href === "/requests" && awaiting > 0 && (
              <span className="ml-auto rounded-full bg-status-awaiting px-2 text-xs font-semibold text-status-awaiting-foreground">
                {awaiting}
                <span className="sr-only"> awaiting decision</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
