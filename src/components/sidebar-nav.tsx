"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { HomeIcon, ListIcon, PlusIcon } from "./ui/icons";

// Balances з'явиться в задачі 3 (task/leave-balance).
const LINKS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/", label: "Overview", icon: <HomeIcon /> },
  { href: "/requests/new", label: "New request", icon: <PlusIcon size={18} /> },
  { href: "/requests", label: "My requests", icon: <ListIcon /> },
];

export function SidebarNav({ awaiting }: { awaiting: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {LINKS.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
              active ? "bg-brand-soft font-medium text-brand-strong" : "text-ink-2 hover:bg-subtle hover:text-ink"
            }`}
          >
            {icon}
            {label}
            {href === "/requests" && awaiting > 0 && (
              <span
                className="ml-auto rounded-full bg-awaiting-soft px-2 text-xs font-semibold text-awaiting"
                aria-label={`${awaiting} awaiting decision`}
              >
                {awaiting}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
