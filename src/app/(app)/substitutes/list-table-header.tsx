import { TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Шапка таблиці списків замін (/substitutes і редактор): підписи колонок і вузька остання колонка без підпису —
 * стрілка рядка чи «⋯» (назва лише для зчитувача екрана).
 */
export function ListTableHeader({ columns, last }: { columns: string[]; last: string }) {
  return (
    <TableHeader className="bg-muted">
      <TableRow className="hover:bg-transparent">
        {columns.map((c) => (
          <TableHead key={c}>{c}</TableHead>
        ))}
        <TableHead className="w-px">
          <span className="sr-only">{last}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}
