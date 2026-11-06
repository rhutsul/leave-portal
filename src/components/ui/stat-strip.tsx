import Link from "next/link";
import { cn } from "@/lib/utils";
import { CountUp } from "./motion";

export interface Stat {
  label: string;
  /** Число рядком ("17.50", "6") — як прийшло з розрахунку; «докручується» після переходу (DESIGN.md, розділ 11). */
  value: string;
  decimals?: number;
  unit: string;
  /** Рядок під числом; з `href` — посилання туди, де з цим числом працюють. */
  sub: string;
  href?: string;
  tone?: "default" | "primary" | "returned";
}

const TONE = {
  default: "text-foreground",
  primary: "text-primary",
  returned: "text-status-returned-foreground",
} as const;

function StatCell({ stat, first }: { stat: Stat; first: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 px-5 py-4", !first && "border-l border-border", stat.tone === "primary" && "bg-primary/5")}>
      <span className="truncate text-xs text-muted-foreground">{stat.label}</span>
      <span className={cn("font-mono text-[28px] leading-8 font-medium tracking-tight tabular-nums", TONE[stat.tone ?? "default"])}>
        <CountUp value={stat.value} decimals={stat.decimals ?? 0} />
        <span className="ml-1.5 font-sans text-[13px] font-normal tracking-normal text-muted-foreground">{stat.unit}</span>
      </span>
      {stat.href ? (
        <Link href={stat.href} className="truncate text-xs font-medium text-primary hover:underline">
          {stat.sub}
        </Link>
      ) : (
        <span className="truncate text-xs text-muted-foreground tabular-nums">{stat.sub}</span>
      )}
    </div>
  );
}

/**
 * Смуга з 3–4 чисел однією панеллю, поділеною тонкими межами (ADR 0007, DESIGN.md `StatStrip`): підпис, число
 * моноширинне, одиниця, рядок під ним. Без тіні; клітинка `primary` — ледь підсвічена, щоб її число читалось першим.
 */
export function StatStrip({ stats, className }: { stats: readonly Stat[]; className?: string }) {
  return (
    <section
      aria-label="Summary"
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {stats.map((s, i) => (
        <StatCell key={s.label} stat={s} first={i === 0} />
      ))}
    </section>
  );
}
