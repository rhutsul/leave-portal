"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Розділи landing на телефоні (ADR 0008): вужче за `md` посилання шапки ховаються в меню з кнопки «Open menu»;
 * «Sign in» чи «Open the portal» лишається в шапці.
 */
export function SectionMenu({ sections }: { sections: readonly { href: string; label: string }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Open menu" className="pointer-coarse:size-11" />}
      >
        <Menu />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {sections.map((section) => (
          <DropdownMenuLinkItem key={section.href} href={section.href} className="pointer-coarse:h-11">
            {section.label}
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
