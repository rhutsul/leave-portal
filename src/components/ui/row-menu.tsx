"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export type RowMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  /** Небезпечна дія (Cancel record): показується останньою, після розділювача, кольором destructive. */
  destructive?: boolean;
  disabled?: boolean;
};

/** Безпечні пункти в заданому порядку й окремо небезпечні, які меню показує останніми. */
export function splitRowMenuItems(items: RowMenuItem[]) {
  return { safe: items.filter((i) => !i.destructive), danger: items.filter((i) => i.destructive) };
}

/**
 * Дії рядка таблиці — лише тут: кнопка «⋯» у кожному рядку відкриває меню (DESIGN.md, розділ 5).
 * Небезпечні пункти автоматично йдуть у кінець, після розділювача.
 */
export function RowMenu({ items, label = "Record actions" }: { items: RowMenuItem[]; label?: string }) {
  const { safe, danger } = splitRowMenuItems(items);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {safe.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.onSelect} disabled={item.disabled}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
        {safe.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map((item) => (
          <DropdownMenuItem key={item.label} variant="destructive" onClick={item.onSelect} disabled={item.disabled}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
