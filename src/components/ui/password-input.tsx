"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

/**
 * Поле пароля з кнопкою «показати / сховати» праворуч. Кнопка — з `aria-label` і `aria-pressed` (DESIGN.md, розділ 7).
 * Натискання мишею не забирає фокус із поля, а курсор лишається там, де людина друкувала: браузер скидає його, коли
 * змінюється тип поля, тож виділення зберігаємо до перемикання й відновлюємо після.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type" | "ref">) {
  const [shown, setShown] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const caret = useRef<[number, number] | null>(null);
  const label = shown ? "Hide password" : "Show password";

  useLayoutEffect(() => {
    const el = field.current;
    const range = caret.current;
    caret.current = null;
    if (!el || !range || document.activeElement !== el) return;
    el.setSelectionRange(...range);
    // Chrome скидає курсор ще раз уже після оновлення поля — повторюємо в наступному кадрі.
    const frame = requestAnimationFrame(() => el.setSelectionRange(...range));
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  return (
    <div className="relative">
      <Input {...props} ref={field} type={shown ? "text" : "password"} className={cn("pr-10", className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={shown}
        title={label}
        disabled={props.disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const el = field.current;
          caret.current = el && el.selectionStart !== null ? [el.selectionStart, el.selectionEnd ?? el.selectionStart] : null;
          setShown((was) => !was);
        }}
        // Без translate для центрування: натиснута Button зсувається на 1 px через translate, і кнопка стрибала б з-під
        // курсора. Поле — h-9 (36 px), кнопка — size-8 (32 px): відступ 2 px зверху.
        className="absolute top-0.5 right-0.5 text-muted-foreground hover:text-foreground"
      >
        {shown ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}
