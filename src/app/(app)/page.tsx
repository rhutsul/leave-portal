import Link from "next/link";

// Головна після входу: куди піти далі. Хто увійшов — у шапці (layout.tsx).
export default function Home() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leave portal</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Request leave according to your schedule and follow the status of each record.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <HomeCard
          href="/requests/new"
          title="New request"
          text="Choose a date, the positions and hours, and the leave type."
        />
        <HomeCard href="/requests" title="My requests" text="Your leave records with their hours and status." />
      </div>
    </>
  );
}

function HomeCard({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <h2 className="font-medium">{title} →</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
    </Link>
  );
}
