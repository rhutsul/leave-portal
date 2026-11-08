"use client";

import { useRef } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Розділи landing на телефоні (ADR 0008): вужче за `md` посилання шапки ховаються в меню з кнопки «Open menu»;
 * «Sign in» чи «Open the portal» лишається в шапці. Вибір розділу переводить фокус на його заголовок (як мобільне меню
 * порталу), а Esc чи клік повз меню — назад на «Open menu».
 */
export function SectionMenu({ sections }: { sections: readonly { href: string; label: string; heading: string }[] }) {
  const chosen = useRef<string | null>(null);

  function focusAfterClose() {
    const id = chosen.current;
    chosen.current = null;
    const heading = id ? document.getElementById(id) : null;
    if (!heading) return true;
    // Прокручує сам перехід за якорем; фокус лише стає на заголовок, без другої прокрутки.
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    return false;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Open menu" className="pointer-coarse:size-11" />}
      >
        <Menu />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44" finalFocus={focusAfterClose}>
        {sections.map((section) => (
          <DropdownMenuLinkItem
            key={section.href}
            href={section.href}
            onClick={() => (chosen.current = section.heading)}
            className="pointer-coarse:h-11"
          >
            {section.label}
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
