"use client";

import { useActionState, useState } from "react";
import {
  buildDayRecords,
  checkLeaveType,
  LEAVE_TYPES,
  positionsOnDate,
  RELATIONSHIPS,
  type DraftRecord,
  type LeaveType,
  type PositionChoice,
  type PositionDay,
  type PositionSchedule,
} from "@/lib/leave/request";
import { formatBlocks, formatDuration, formatRange } from "@/lib/leave/time";
import { submitLeaveRequest, type SubmitState } from "./actions";

type Step = "date" | "positions" | "type" | "summary";

const STEPS: { id: Step; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "positions", label: "Positions and hours" },
  { id: "type", label: "Leave type" },
  { id: "summary", label: "Summary" },
];

const INITIAL: SubmitState = { message: "" };

// Заявка на одну дату: дата → посади й години → тип → підсумок → підтвердження (D6). Перевірки на кожному кроці —
// ті самі чисті функції src/lib/leave/, що й у server action; введене зберігається при поверненні назад.
export function NewRequestForm({ positions }: { positions: PositionSchedule[] }) {
  const [step, setStep] = useState<Step>("date");
  const [date, setDate] = useState("");
  const [dayPositions, setDayPositions] = useState<PositionDay[]>([]);
  const [choices, setChoices] = useState<Record<number, PositionChoice>>({});
  const [records, setRecords] = useState<DraftRecord[]>([]);
  const [leaveType, setLeaveType] = useState<LeaveType | "">("");
  const [relationship, setRelationship] = useState("");
  const [error, setError] = useState<{ message: string; positionId?: number } | null>(null);
  const [state, formAction, pending] = useActionState(submitLeaveRequest, INITIAL);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  function confirmDate() {
    const day = positionsOnDate(positions, date);
    if (!day.ok) {
      setError({ message: day.message });
      return;
    }
    setDayPositions(day.positions);
    setChoices((prev) => {
      const next: Record<number, PositionChoice> = {};
      for (const p of day.positions) {
        next[p.id] = prev[p.id] ?? { positionId: p.id, include: true, wholeDay: true, start: "", end: "" };
      }
      return next;
    });
    go("positions");
  }

  function confirmPositions() {
    const result = buildDayRecords(date, dayPositions, Object.values(choices));
    if (!result.ok) {
      setError({ message: result.message, positionId: result.positionId });
      return;
    }
    setRecords(result.records);
    go("type");
  }

  function confirmType() {
    const result = checkLeaveType(leaveType, relationship);
    if (!result.ok) {
      setError({ message: result.message });
      return;
    }
    go("summary");
  }

  const updateChoice = (id: number, patch: Partial<PositionChoice>) =>
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const labelOf = (id: number) => dayPositions.find((p) => p.id === id)?.label ?? "";
  const totalMinutes = records.reduce((sum, r) => sum + r.minutes, 0);
  const payload = JSON.stringify({ date, leaveType, relationship, choices: Object.values(choices) });

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={step} />

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {step === "date" && (
          <div className="flex flex-col gap-4">
            <SectionTitle title="When do you need leave?" hint="Choose the date of your leave." />
            <label className="flex max-w-xs flex-col gap-1 text-sm font-medium">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <ErrorMessage error={error} />
            <Actions>
              <PrimaryButton onClick={confirmDate} disabled={!date}>
                Continue
              </PrimaryButton>
            </Actions>
          </div>
        )}

        {step === "positions" && (
          <div className="flex flex-col gap-4">
            <SectionTitle
              title={`Positions on ${date}`}
              hint="Include each position you will be absent from — for the whole day or for specific hours."
            />
            <ul className="flex flex-col gap-3">
              {dayPositions.map((p) => {
                const choice = choices[p.id];
                const invalid = error?.positionId === p.id;
                return (
                  <li
                    key={p.id}
                    className={`rounded-lg border p-4 ${
                      invalid ? "border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : "border-zinc-200 dark:border-zinc-800"
                    } ${choice.include ? "" : "opacity-60"}`}
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={choice.include}
                        onChange={(e) => updateChoice(p.id, { include: e.target.checked })}
                        className="mt-1 size-4 accent-zinc-900 dark:accent-zinc-100"
                      />
                      <span className="flex-1">
                        <span className="flex items-center gap-2 font-medium">
                          {p.label}
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {p.kind === "main" ? "Main" : "Additional"}
                          </span>
                        </span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">
                          Schedule: {formatBlocks(p.blocks)}
                        </span>
                      </span>
                    </label>
                    {choice.include && (
                      <div className="mt-3 flex flex-wrap items-end gap-4 pl-7 text-sm">
                        <fieldset className="flex gap-4">
                          <legend className="sr-only">Hours for {p.label}</legend>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`mode-${p.id}`}
                              checked={choice.wholeDay}
                              onChange={() => updateChoice(p.id, { wholeDay: true })}
                              className="accent-zinc-900 dark:accent-zinc-100"
                            />
                            Whole day
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`mode-${p.id}`}
                              checked={!choice.wholeDay}
                              onChange={() => updateChoice(p.id, { wholeDay: false })}
                              className="accent-zinc-900 dark:accent-zinc-100"
                            />
                            Specific hours
                          </label>
                        </fieldset>
                        {!choice.wholeDay && (
                          <div className="flex items-end gap-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500">From</span>
                              <input
                                type="time"
                                step={300}
                                value={choice.start ?? ""}
                                onChange={(e) => updateChoice(p.id, { start: e.target.value })}
                                className={inputClass}
                              />
                            </label>
                            <span className="pb-2 text-zinc-400">–</span>
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-500">To</span>
                              <input
                                type="time"
                                step={300}
                                value={choice.end ?? ""}
                                onChange={(e) => updateChoice(p.id, { end: e.target.value })}
                                className={inputClass}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                    {invalid && <ErrorMessage error={error} className="mt-3 pl-7" />}
                  </li>
                );
              })}
            </ul>
            {error && error.positionId === undefined && <ErrorMessage error={error} />}
            <Actions>
              <SecondaryButton onClick={() => go("date")}>Back</SecondaryButton>
              <PrimaryButton onClick={confirmPositions}>Continue</PrimaryButton>
            </Actions>
          </div>
        )}

        {step === "type" && (
          <div className="flex flex-col gap-4">
            <SectionTitle title="Leave type" hint="One leave type per request." />
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(LEAVE_TYPES) as LeaveType[]).map((type) => (
                <label
                  key={type}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm font-medium ${
                    leaveType === type
                      ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="leave-type"
                    checked={leaveType === type}
                    onChange={() => setLeaveType(type)}
                    className="accent-zinc-900 dark:accent-zinc-100"
                  />
                  {LEAVE_TYPES[type]}
                </label>
              ))}
            </div>
            {leaveType === "family" && (
              <label className="flex max-w-xs flex-col gap-1 text-sm font-medium">
                Relationship of the person the celebration is for
                <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ErrorMessage error={error} />
            <Actions>
              <SecondaryButton onClick={() => go("positions")}>Back</SecondaryButton>
              <PrimaryButton onClick={confirmType} disabled={!leaveType}>
                Continue
              </PrimaryButton>
            </Actions>
          </div>
        )}

        {step === "summary" && leaveType && (
          <form action={formAction} className="flex flex-col gap-4">
            <SectionTitle title="Summary" hint="Check your request and confirm it." />
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-zinc-500">Leave type</dt>
              <dd className="font-medium">
                {LEAVE_TYPES[leaveType]}
                {leaveType === "family" && relationship ? ` · ${relationship}` : ""}
              </dd>
              <dt className="text-zinc-500">Total</dt>
              <dd className="font-medium">{formatDuration(totalMinutes)}</dd>
            </dl>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Position</th>
                  <th className="py-2 pr-4 font-medium">Hours</th>
                  <th className="py-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {records.map((r) => (
                  <tr key={r.positionId}>
                    <td className="py-2 pr-4 tabular-nums">{r.date}</td>
                    <td className="py-2 pr-4">{labelOf(r.positionId)}</td>
                    <td className="py-2 pr-4 tabular-nums">{formatRange(r.start, r.end)}</td>
                    <td className="py-2 tabular-nums">{formatDuration(r.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <input type="hidden" name="payload" value={payload} />
            {state.message && <ErrorMessage error={{ message: state.message }} />}
            <Actions>
              <SecondaryButton onClick={() => go("positions")} disabled={pending}>
                Back to editing
              </SecondaryButton>
              <button type="submit" disabled={pending} className={primaryClass}>
                {pending ? "Submitting…" : "Confirm"}
              </button>
            </Actions>
          </form>
        )}
      </section>
    </div>
  );
}

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950";
const primaryClass =
  "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";
const secondaryClass =
  "rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
              i <= index
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
            }`}
          >
            {i + 1}
          </span>
          <span className={i === index ? "font-medium" : "text-zinc-500"}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-zinc-300 dark:bg-zinc-700" />}
        </li>
      ))}
    </ol>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>
    </div>
  );
}

function ErrorMessage({ error, className = "" }: { error: { message: string } | null; className?: string }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={`rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 ${className}`}
    >
      {error.message}
    </p>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">{children}</div>;
}

function PrimaryButton(props: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} className={primaryClass}>
      {props.children}
    </button>
  );
}

function SecondaryButton(props: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} className={secondaryClass}>
      {props.children}
    </button>
  );
}
