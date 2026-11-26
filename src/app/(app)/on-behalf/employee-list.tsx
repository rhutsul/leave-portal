"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ON_BEHALF_MESSAGES } from "@/lib/leave/on-behalf";
import { ListTableHeader } from "../substitutes/list-table-header";

export interface OnBehalfEmployee {
  id: string;
  email: string;
  /** «Elementary school / Teacher» — основна посада; порожньо, якщо її немає. */
  position: string;
}

/**
 * Працівники, за яких можна подати (D11): фільтр за email на клієнті; рядок цілком — посилання на форму, праворуч
 * стрілка, як черга «Decisions». Телефон — картки (Table stack).
 */
export function EmployeeList({
  employees,
  linkBase = "/on-behalf/",
}: {
  employees: OnBehalfEmployee[];
  /** Початок адреси рядка: форма від імені; на вітрині /design — безпечне посилання на саму вітрину. */
  linkBase?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? employees.filter((e) => e.email.toLowerCase().includes(q) || e.position.toLowerCase().includes(q)) : employees;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor={`${id}-find`}>Find an employee</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`${id}-find`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Email or position"
            autoComplete="off"
            className="pl-8"
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<Search className="size-5" aria-hidden="true" />} title={ON_BEHALF_MESSAGES.noMatch} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <Table stack>
            <ListTableHeader columns={["Employee"]} last="Open" />
            <TableBody>
              {shown.map((e) => (
                // Увесь рядок відкриває форму: посилання в першій клітинці розтягнуто на рядок (after:inset-0).
                <TableRow key={e.id} data-testid="on-behalf-employee" className="relative cursor-pointer">
                  <TableCell className="min-w-44 whitespace-normal">
                    <Link
                      href={`${linkBase}${e.id}`}
                      className="font-medium break-all text-foreground outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                    >
                      {e.email}
                    </Link>
                    {e.position && <span className="block text-xs text-muted-foreground">{e.position}</span>}
                  </TableCell>
                  <TableCell data-cell="end" className="w-px text-muted-foreground max-md:p-2.5!">
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
