"use client";

import { useRouter } from "next/navigation";
import { CalendarClock, UsersRound } from "lucide-react";
import { RowMenu } from "@/components/ui/row-menu";

/** Дії посади — у «⋯» (DESIGN.md, розділ 5): новий розклад з дати й відповідальні менеджери, окремими сторінками. */
export function PositionMenu({ employeeId, positionId, label }: { employeeId: string; positionId: number; label: string }) {
  const router = useRouter();
  const base = `/staff/${employeeId}/positions/${positionId}`;
  return (
    <RowMenu
      label={`Actions for ${label}`}
      items={[
        { label: "Change schedule", icon: <CalendarClock />, onSelect: () => router.push(`${base}/schedule`) },
        { label: "Change managers", icon: <UsersRound />, onSelect: () => router.push(`${base}/managers`) },
      ]}
    />
  );
}
