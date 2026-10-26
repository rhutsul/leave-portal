"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type PickerEmployee = { id: string; name: string; email: string };

function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Ініціали в колі; для «My balances» — іконка людини. */
function Avatar({ employee, className }: { employee: PickerEmployee | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground [&_svg]:size-3.5",
        className,
      )}
    >
      {employee ? initials(employee.name) : <UserRound />}
    </span>
  );
}

/**
 * Вибір працівника на /balances для менеджера й адміністратора: пункт — ініціали, ім'я, нижче email. Перехід — одразу
 * після вибору (той самий `?employee=&year=`, що й у формі); без JavaScript спрацює GET-форма з кнопкою «Show».
 * `own` — значення пункту «My balances» (Base UI не приймає "" як значення пункту).
 */
export function EmployeePicker({
  employees,
  selected,
  own,
  year,
}: {
  employees: PickerEmployee[];
  selected: string;
  own: string;
  year: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const byId = new Map(employees.map((e) => [e.id, e]));
  const items = [{ value: own, label: "My balances" }, ...employees.map((e) => ({ value: e.id, label: e.name }))];

  function go(value: unknown) {
    if (typeof value !== "string") return;
    const params = new URLSearchParams();
    if (value !== own) params.set("employee", value);
    params.set("year", String(year));
    startTransition(() => router.push(`/balances?${params}`));
  }

  return (
    <form action="/balances" className="flex items-center gap-3">
      <input type="hidden" name="year" value={year} />
      <Label htmlFor="balances-employee" className="text-muted-foreground">
        Employee
      </Label>
      <Select name="employee" defaultValue={selected} items={items} onValueChange={go}>
        <SelectTrigger id="balances-employee" className="h-9 min-w-64" aria-busy={pending || undefined}>
          <SelectValue>
            {(value: string) => (
              <span className="flex min-w-0 items-center gap-2">
                <Avatar employee={byId.get(value) ?? null} className="size-5 text-[10px]" />
                <span className="truncate">{byId.get(value)?.name ?? "My balances"}</span>
              </span>
            )}
          </SelectValue>
          {pending && (
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent text-muted-foreground motion-safe:animate-spin"
            />
          )}
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" className="w-auto max-w-80 min-w-(--anchor-width)">
          {items.map((item) => {
            const employee = byId.get(item.value) ?? null;
            return (
              <SelectItem key={item.value} value={item.value}>
                <Avatar employee={employee} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {employee ? employee.email : "Your own balances"}
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {/* Без JavaScript вибір не переходить сам — тоді звичайна GET-форма. */}
      <noscript>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </noscript>
    </form>
  );
}
