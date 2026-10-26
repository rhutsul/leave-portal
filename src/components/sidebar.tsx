import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Button } from "./ui/button";
import { SidebarNav } from "./sidebar-nav";

function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Бічна навігація (DESIGN.md, AppNav): назва порталу, розділи ролі, внизу — хто увійшов і вихід. */
export function Sidebar({
  name,
  email,
  awaiting,
  toDecide,
  canDecide,
}: {
  name: string;
  email: string;
  awaiting: number;
  /** Записи «Awaiting decision», які користувач може вирішити (лічильник «Decisions»). */
  toDecide: number;
  canDecide: boolean;
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-55 shrink-0 flex-col gap-5 border-r border-border bg-sidebar px-3 py-4 text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-2 py-1 text-[15px] font-semibold text-foreground">
        <span aria-hidden="true" className="size-5.5 rounded-sm bg-primary" />
        Leave Portal
      </div>

      <SidebarNav awaiting={awaiting} toDecide={toDecide} canDecide={canDecide} />

      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-1.5 pt-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div data-testid="user-name" className="truncate text-[13px] font-medium text-foreground">
            {name}
          </div>
          <div data-testid="user-email" className="truncate text-xs text-muted-foreground">
            {email}
          </div>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out">
            <LogOut />
          </Button>
        </form>
      </div>
    </aside>
  );
}
