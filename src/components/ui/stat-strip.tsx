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

function StatCell({ stat }: { stat: Stat }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 px-5 py-4", stat.tone === "primary" ? "bg-accent" : "bg-card")}>
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
 * моноширинне, одиниця, рядок під ним. Без тіні; клітинка `primary` — на тлі `accent`, щоб її число читалось першим.
 */
export function StatStrip({ stats, className }: { stats: readonly Stat[]; className?: string }) {
  return (
    // Межі між клітинками — проміжок 1 px над тлом `border`: так вони правильні й тоді, коли смуга переноситься
    // (2 × 2 у вузькому контейнері, 4 в ряд від 42rem).
    <section aria-label="Summary" className={cn("@container overflow-hidden rounded-lg border border-border", className)}>
      <div className="grid grid-cols-2 gap-px bg-border @2xl:grid-cols-4">
        {stats.map((s) => (
          <StatCell key={s.label} stat={s} />
        ))}
      </div>
    </section>
  );
}
