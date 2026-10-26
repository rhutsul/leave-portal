"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { parseTheme, preferenceCookie, THEME_COOKIE, themeAttribute, type Theme } from "@/lib/preferences";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Вибір теми (ADR 0005): Light, Dark або System — за системою, за замовчуванням. Вибір іде в cookie, з якої сервер
 * ставить `data-theme` на `<html>` наступного разу, а зараз атрибут міняється одразу, без перезавантаження.
 * `initial` — тема з cookie, яку прочитав сервер, тож іконка кнопки збігається з розміткою сервера.
 */
export function ThemeMenu({ initial, side = "bottom", align = "end" }: { initial: Theme; side?: "bottom" | "right"; align?: "start" | "end" }) {
  const [theme, setTheme] = useState<Theme>(initial);

  // Кілька меню на сторінці (бічна панель і вітрина /design) показують один вибір: стежимо за data-theme на <html>.
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => setTheme(parseTheme(html.dataset.theme)));
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const Icon = current.icon;

  function choose(value: unknown) {
    const next = parseTheme(typeof value === "string" ? value : undefined);
    setTheme(next);
    document.cookie = preferenceCookie(THEME_COOKIE, next === "system" ? null : next);
    const attribute = themeAttribute(next);
    if (attribute) document.documentElement.dataset.theme = attribute;
    else delete document.documentElement.dataset.theme;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Theme: ${current.label}`} />}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="min-w-36">
        <DropdownMenuRadioGroup value={theme} onValueChange={choose}>
          {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <ItemIcon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
