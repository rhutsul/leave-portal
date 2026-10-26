/**
 * Налаштування вигляду, які пам'ятає браузер (ADR 0005): тема й згорнута бічна панель. Обидва — у cookie, щоб сервер
 * відмалював сторінку одразу правильно, без спалаху після завантаження.
 */

export const THEME_COOKIE = "theme";
export const SIDEBAR_COOKIE = "sidebar";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Значення cookie → тема; будь-що інше (немає cookie, зіпсоване значення) — «System», як за замовчуванням. */
export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** `data-theme` для `<html>`: лише для явно вибраної теми; «System» — без атрибута, діє `prefers-color-scheme`. */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}

export function isSidebarCollapsed(value: string | undefined): boolean {
  return value === "collapsed";
}

const YEAR = 60 * 60 * 24 * 365;

/** Рядок для `document.cookie`: на рік, для всього сайту; `null` — прибрати cookie. */
export function preferenceCookie(name: string, value: string | null): string {
  return value === null
    ? `${name}=; path=/; max-age=0; samesite=lax`
    : `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}
