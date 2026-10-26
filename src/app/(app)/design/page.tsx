import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Ban, CalendarDays, Clock, Eye, Info, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BalanceCard } from "@/components/ui/balance-card";
import { Button } from "@/components/ui/button";
import { CalendarDay, CalendarLegend, type DayState } from "@/components/ui/calendar-day";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { HoursBar } from "@/components/ui/hours-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { RecordSummary } from "@/components/ui/record-summary";
import { RowMenu } from "@/components/ui/row-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LEAVE_TYPES } from "@/lib/leave/request";

export const metadata: Metadata = { title: "Design system · Leave portal" };

// Вітрина дизайн-системи (DESIGN.md): усі токени й компоненти в одному місці — перевірка зміни в обох темах.
// Дані — приклади, не з бази.

const SURFACES = [
  ["background", "bg-background text-foreground"],
  ["card", "bg-card text-card-foreground"],
  ["popover", "bg-popover text-popover-foreground"],
  ["muted", "bg-muted text-muted-foreground"],
  ["accent", "bg-accent text-accent-foreground"],
  ["secondary", "bg-secondary text-secondary-foreground"],
  ["primary", "bg-primary text-primary-foreground"],
  ["destructive", "bg-destructive text-destructive-foreground"],
  ["highlight", "bg-highlight text-highlight-foreground"],
  ["sidebar", "bg-sidebar text-sidebar-foreground"],
  ["sidebar-accent", "bg-sidebar-accent text-sidebar-accent-foreground"],
  ["warning", "bg-warning text-warning-foreground"],
  ["info", "bg-info text-info-foreground"],
  ["status-awaiting", "bg-status-awaiting text-status-awaiting-foreground"],
  ["status-approved", "bg-status-approved text-status-approved-foreground"],
  ["status-rejected", "bg-status-rejected text-status-rejected-foreground"],
  ["status-returned", "bg-status-returned text-status-returned-foreground"],
  ["status-cancelled", "bg-status-cancelled text-status-cancelled-foreground"],
  ["leave-sick", "bg-leave-sick text-leave-sick-foreground"],
  ["leave-personal", "bg-leave-personal text-leave-personal-foreground"],
  ["leave-unpaid", "bg-leave-unpaid text-leave-unpaid-foreground"],
  ["leave-family", "bg-leave-family text-leave-family-foreground"],
] as const;

const LEAVE_TYPE_ITEMS = Object.entries(LEAVE_TYPES).map(([value, label]) => ({ value, label }));

const LINES = [
  ["border", "border-border"],
  ["input", "border-input"],
  ["ring", "border-ring"],
] as const;

// Листопад 2026: 1-ше — неділя; вихідні без годин, 10 і 17 — уже є запис, 11 — закрито школою, 3–4 вибрано.
const NOVEMBER: (DayState | null)[] = [
  ...Array<null>(6).fill(null),
  ...Array.from({ length: 30 }, (_, i): DayState => {
    const d = i + 1;
    const dow = (6 + d - 1) % 7;
    if (dow >= 5) return "off";
    if (d === 3 || d === 4) return "selected";
    if (d === 10 || d === 17) return "record";
    if (d === 11) return "closed";
    return "free";
  }),
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <>
      <PageHeader
        title="Design system"
        description="Tokens and components from DESIGN.md. Switch the system theme to check dark mode."
      />

      <Section title="Colours">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {SURFACES.map(([name, cls]) => (
            <div key={name} className={`flex h-16 flex-col justify-end rounded-md border border-border px-3 py-2 ${cls}`}>
              <span className="text-xs font-medium">{name}</span>
            </div>
          ))}
          {LINES.map(([name, cls]) => (
            <div key={name} className={`flex h-16 items-end rounded-md border-2 bg-card px-3 py-2 ${cls}`}>
              <span className="text-xs font-medium">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <span className="text-2xl font-semibold tracking-tight">Page title — My requests</span>
            <span className="text-base font-semibold">Section title — Your request</span>
            <span className="text-sm">Body — Doctor&apos;s appointment, Elementary school teacher</span>
            <span className="text-[13px] font-medium">Label — Leave type</span>
            <span className="text-xs text-muted-foreground">Caption — 20/500 · Oldest submitted 2 days ago</span>
            <span className="text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums">
              22.00<span className="ml-1.5 text-sm font-medium tracking-normal text-muted-foreground">days</span>
            </span>
            <span className="font-mono text-[13px]">AC-LEAVE-02</span>
          </CardContent>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Submit request</Button>
          <Button variant="secondary">Save draft</Button>
          <Button variant="outline">Change hours</Button>
          <Button variant="ghost">Back</Button>
          <Button variant="destructive">Cancel record</Button>
          <Button variant="link">View history</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled aria-busy="true">
            <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
            Submitting…
          </Button>
          <Button size="sm" variant="outline">
            <Clock /> Change hours
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Sign out">
            <X />
          </Button>
          <Tooltip>
            <TooltipTrigger render={<Button size="icon-sm" variant="outline" aria-label="What is a day?" />}>
              <Info />
            </TooltipTrigger>
            <TooltipContent>1 day is all your working hours on that date.</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Section title="Fields">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds-start">Start</Label>
              <Input id="ds-start" defaultValue="08:30" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds-end">End</Label>
              <Input id="ds-end" defaultValue="07:30" aria-invalid="true" aria-describedby="ds-end-error" />
              <p id="ds-end-error" className="text-xs text-destructive">
                Hours must be within your schedule: 08:30–12:00, 12:30–15:30
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds-type">Leave type</Label>
              <Select defaultValue="personal" items={LEAVE_TYPE_ITEMS}>
                <SelectTrigger id="ds-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="ds-comment">Comment</Label>
                <span className="text-xs text-muted-foreground">Optional · 20/500</span>
              </div>
              <Textarea id="ds-comment" defaultValue="Doctor's appointment" />
            </div>
            <label className="flex items-center gap-3 rounded-md border border-ring bg-accent px-3.5 py-3">
              <Checkbox defaultChecked />
              <span className="flex flex-col">
                <span className="font-medium">Elementary school teacher</span>
                <span className="text-xs text-muted-foreground">Main · Elementary school · Mon–Fri 08:30–15:30</span>
              </span>
            </label>
          </CardContent>
        </Card>
      </Section>

      <Section title="Status and leave type">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="awaiting" />
          <StatusBadge status="approved" />
          <StatusBadge status="rejected" />
          <StatusBadge status="returned" />
          <StatusBadge status="cancelled" />
        </div>
        <div className="flex flex-wrap gap-3">
          <LeaveTypeTag type="sick" />
          <LeaveTypeTag type="personal" />
          <LeaveTypeTag type="unpaid" />
          <LeaveTypeTag type="family" />
        </div>
        <div className="flex flex-wrap gap-5">
          <LeaveTypeTag type="sick" variant="inline" />
          <LeaveTypeTag type="personal" variant="inline" />
          <LeaveTypeTag type="unpaid" variant="inline" />
          <LeaveTypeTag type="family" variant="inline" />
        </div>
      </Section>

      <Section title="Table with row menus">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-px">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="bg-background text-xs font-medium text-muted-foreground">
                  November 2026
                </TableCell>
              </TableRow>
              <TableRow className="animate-row-flash">
                <TableCell className="tabular-nums">Tue 3</TableCell>
                <TableCell>Elementary school teacher</TableCell>
                <TableCell>
                  <HoursBar start={510} end={930} dayStart={510} dayEnd={930} label="Whole day" />
                </TableCell>
                <TableCell>
                  <LeaveTypeTag type="sick" variant="inline" />
                </TableCell>
                <TableCell>
                  <StatusBadge status="awaiting" />
                </TableCell>
                <TableCell>
                  <RowMenu
                    items={[
                      { label: "Change hours", icon: <Clock /> },
                      { label: "View details", icon: <Eye /> },
                      { label: "Cancel record", icon: <X />, destructive: true },
                    ]}
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="tabular-nums">Mon 2</TableCell>
                <TableCell>High school math teacher</TableCell>
                <TableCell>
                  <HoursBar start={945} end={1020} dayStart={945} dayEnd={1020} label="15:45–17:00" />
                </TableCell>
                <TableCell>
                  <LeaveTypeTag type="personal" variant="inline" />
                </TableCell>
                <TableCell>
                  <StatusBadge status="returned" />
                  <span className="mt-1 block text-xs text-muted-foreground">Manager: “Please end at 16:30”</span>
                </TableCell>
                <TableCell>
                  <RowMenu
                    items={[
                      { label: "Resubmit", icon: <RotateCcw /> },
                      { label: "View details", icon: <Eye /> },
                      { label: "Cancel record", icon: <X />, destructive: true },
                    ]}
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="tabular-nums">Thu 29</TableCell>
                <TableCell>Elementary school teacher</TableCell>
                <TableCell>
                  <HoursBar start={750} end={930} dayStart={510} dayEnd={930} label="12:30–15:30" />
                </TableCell>
                <TableCell>
                  <LeaveTypeTag type="unpaid" variant="inline" />
                </TableCell>
                <TableCell>
                  <StatusBadge status="rejected" />
                  <span className="mt-1 block text-xs text-muted-foreground">Manager: “Not enough staff that day”</span>
                </TableCell>
                <TableCell>
                  <RowMenu items={[{ label: "View details", icon: <Eye /> }]} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Balances">
        <div className="grid gap-4 sm:grid-cols-3">
          <BalanceCard title="Sick leave left" value="22.00" used="1.00" total="23.00" />
          <BalanceCard title="Personal leave left" value="0.50" used="17.50" total="18.00" />
          <Card className="gap-2.5 px-5 py-4">
            <span className="text-[13px] text-muted-foreground">Awaiting decision</span>
            <span className="text-[26px] leading-[30px] font-semibold tracking-tight">3 records</span>
            <span className="text-xs text-muted-foreground">Oldest submitted 2 days ago</span>
          </Card>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5" aria-hidden="true" />
          Balances are in working days: 1 day is all your working hours on that date.
        </p>
      </Section>

      <Section title="Calendar">
        <Card className="max-w-xl">
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {NOVEMBER.map((state, i) =>
                state ? <CalendarDay key={i} day={i - 5} state={state} /> : <span key={i} aria-hidden="true" />,
              )}
            </div>
            <CalendarLegend />
          </CardContent>
        </Card>
      </Section>

      <Section title="Messages">
        <div className="flex max-w-2xl flex-col gap-3">
          <Alert variant="destructive">
            <Ban />
            <AlertTitle>Request not sent</AlertTitle>
            <AlertDescription>You already have a request for this time: 2026-11-03 09:00–11:00</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Over your balance</AlertTitle>
            <AlertDescription>You have 0.50 days of Personal leave left. Your manager will see this.</AlertDescription>
          </Alert>
          <Alert variant="info">
            <Info />
            <AlertTitle>Request submitted</AlertTitle>
            <AlertDescription>2 records were created for Tue 3 Nov: one for each of your positions.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Summary, dialog, empty and loading states">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Record summary</CardTitle>
              <CardDescription>What an action is about.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <RecordSummary date="Tue, 3 Nov 2026" hours="08:30–12:00" meta="Elementary school teacher · Sick leave" />
              <Dialog>
                <DialogTrigger render={<Button variant="outline" className="self-start" />}>Open cancel dialog</DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel this record?</DialogTitle>
                    <DialogDescription>Your manager will no longer see it.</DialogDescription>
                  </DialogHeader>
                  <RecordSummary date="Tue, 3 Nov 2026" hours="08:30–12:00" meta="Elementary school teacher · Sick leave" />
                  <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
                    <Button variant="destructive">Cancel record</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4">
            <EmptyState
              title="No records awaiting decision"
              text="New records of your positions will appear here."
              icon={<CalendarDays className="size-5" aria-hidden="true" />}
            />
            <Card>
              <CardContent className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading records">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9 w-4/5" />
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
