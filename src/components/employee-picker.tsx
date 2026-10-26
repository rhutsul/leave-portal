"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { UserRound } from "lucide-react";
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
        "grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground [&_svg]:size-3.5",
        className,
      )}
    >
      {employee ? initials(employee.name) : <UserRound />}
    </span>
  );
}

/**
 * Вибір працівника на /balances для менеджера й адміністратора: пункт — ініціали, ім'я, нижче email. Перехід — одразу
 * після вибору, з тим самим `?employee=&year=`. `selected` — з адреси сторінки: Select керований, тож після «Назад» чи
 * переходу з меню показує саме те, чиї залишки на сторінці. `own` — значення пункту «My balances» (Base UI не приймає
 * "" як значення пункту). Без JavaScript список не відкривається зовсім, тож запасної форми немає: рік і чужі
 * залишки відкриваються посиланнями.
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
  // `?employee=` не зі списку (чужий чи зіпсований id): сторінка каже, що залишки недоступні, а вибір — нейтральний.
  const known = selected === own || byId.has(selected);

  function go(value: unknown) {
    if (typeof value !== "string" || value === selected) return;
    const params = new URLSearchParams();
    if (value !== own) params.set("employee", value);
    params.set("year", String(year));
    startTransition(() => router.push(`/balances?${params}`));
  }

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="balances-employee" className="text-muted-foreground">
        Employee
      </Label>
      <Select value={known ? selected : null} items={items} onValueChange={go}>
        <SelectTrigger id="balances-employee" className="h-9 max-w-80 min-w-64" aria-busy={pending || undefined}>
          <SelectValue>
            {(value: string | null) =>
              value === null ? (
                <span className="text-muted-foreground">Select an employee</span>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar employee={byId.get(value) ?? null} className="size-5 text-[10px]" />
                  <span className="truncate">{byId.get(value)?.name ?? "My balances"}</span>
                </span>
              )
            }
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
              // label — для пошуку набором тексту: без нього Base UI шукав би й в ініціалах та email.
              <SelectItem key={item.value} value={item.value} label={item.label}>
                <span className="flex items-center gap-2">
                  <Avatar employee={employee} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{item.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {employee ? employee.email : "Your own balances"}
                    </span>
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
