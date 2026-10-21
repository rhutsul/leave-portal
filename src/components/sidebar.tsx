import { signOut } from "@/app/login/actions";
import { CalendarIcon, SignOutIcon } from "./ui/icons";
import { SidebarNav } from "./sidebar-nav";

function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Бічне меню: назва порталу, розділи, внизу — хто увійшов і вихід. */
export function Sidebar({
  name,
  email,
  awaiting,
  canDecide,
}: {
  name: string;
  email: string;
  awaiting: number;
  canDecide: boolean;
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-62 shrink-0 flex-col gap-6 border-r border-line bg-surface px-4 py-5">
      <div className="flex items-center gap-2.5 px-2 py-1">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-on-brand">
          <CalendarIcon />
        </span>
        <span className="text-[15px] font-semibold">Leave portal</span>
      </div>

      <SidebarNav awaiting={awaiting} canDecide={canDecide} />

      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-2 pt-4">
        <span
          aria-hidden="true"
          className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-brand-muted text-[13px] font-semibold text-brand-strong"
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div data-testid="user-name" className="truncate text-[13px] font-medium">
            {name}
          </div>
          <div data-testid="user-email" className="truncate text-xs text-muted">
            {email}
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="flex size-8.5 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 hover:bg-subtle hover:text-ink"
          >
            <SignOutIcon />
          </button>
        </form>
      </div>
    </aside>
  );
}
