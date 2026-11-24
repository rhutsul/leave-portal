"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerHref, type RegisterDivision } from "@/lib/register/register";

/**
 * Вибір підрозділу на /register (ADR 0012): лише підрозділи, які дала база (адміністратору — усі, менеджеру — де він
 * веде посаду). Перехід — одразу після вибору, з тим самим місяцем; `selected` — з адреси сторінки (керований Select).
 */
export function DivisionPicker({
  divisions,
  selected,
  month,
}: {
  divisions: readonly RegisterDivision[];
  selected: string;
  month: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const items = divisions.map((d) => ({ value: d.code, label: d.name }));

  function go(value: unknown) {
    if (typeof value !== "string" || value === selected) return;
    startTransition(() => router.push(registerHref(value, month)));
  }

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="register-division" className="text-muted-foreground">
        Division
      </Label>
      <Select value={selected} items={items} onValueChange={go}>
        <SelectTrigger id="register-division" className="h-9 max-w-72 min-w-52" aria-busy={pending || undefined}>
          <SelectValue />
          {pending && (
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent text-muted-foreground motion-safe:animate-spin"
            />
          )}
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" className="w-auto max-w-72 min-w-(--anchor-width)">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
