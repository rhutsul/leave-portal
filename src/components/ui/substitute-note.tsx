import { ArrowUpRight, UserRound } from "lucide-react";
import { substituteLabel, upgradeLabel } from "@/lib/leave/substitutes";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

/**
 * Заміна запису (D8 openspec/changes/impl-substitutes/design.md): іконка й «Substitute: <email>» або «No substitute»
 * (AC-SUBST-02, AC-SUBST-03) дрібним приглушеним рядком; email — основним кольором тексту. Позначка підвищення —
 * тег «With upgrade: N min» на secondary (AC-SUBST-08); немає позначки — нічого (AC-SUBST-09). Лише токени.
 */
export function SubstituteNote({
  email,
  upgradeMinutes,
  className,
}: {
  email: string | null | undefined;
  upgradeMinutes?: number | null;
  className?: string;
}) {
  return (
    <span data-testid="substitute-note" className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
        {email ? (
          <span className="min-w-0 break-all">
            Substitute: <span className="text-foreground">{email}</span>
          </span>
        ) : (
          substituteLabel(null)
        )}
      </span>
      {email && upgradeMinutes != null && <UpgradeBadge minutes={upgradeMinutes} />}
    </span>
  );
}

/**
 * Заміна збереженого запису («My requests», «Decisions»): null — «No substitute»; undefined — заміни не завантажились
 * (наприклад, до міграції, D11), тоді рядка немає зовсім.
 */
export function RecordSubstituteNote({
  substitute,
  className,
}: {
  substitute: { email: string; upgradeMinutes: number | null } | null | undefined;
  className?: string;
}) {
  if (substitute === undefined) return null;
  return <SubstituteNote email={substitute?.email} upgradeMinutes={substitute?.upgradeMinutes} className={className} />;
}

/** «With upgrade: 210 min» — тег без власних кольорів (secondary). */
export function UpgradeBadge({ minutes, className }: { minutes: number; className?: string }) {
  return (
    <Badge variant="secondary" data-testid="upgrade-mark" className={cn("tabular-nums", className)}>
      <ArrowUpRight data-icon="inline-start" aria-hidden="true" />
      {upgradeLabel(minutes)}
    </Badge>
  );
}
