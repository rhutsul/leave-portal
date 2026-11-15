"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { CircleAlert, Info, Sparkles, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ASSISTANT_MESSAGES, ASSISTANT_TEXT_MAX, assistantTextLength, type Suggestion } from "@/lib/ai/suggestions";
import { closureFieldErrors } from "@/lib/leave/calendar";
import { closureFields, closurePick } from "@/lib/leave/closure-dates";
import { formatTime } from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import { requestSuggestions, saveSuggestions, type AssistantState, type SaveState } from "./actions";

type Kind = "days" | "early";
type FieldErrors = ReturnType<typeof closureFieldErrors>;

/** Пропозиція в стані форми: ті самі поля, що в «Add closure» (людина може змінити кожне). */
interface Item {
  key: number;
  kind: Kind;
  name: string;
  dates: string[];
  time: string;
  /** Помилка збереження цієї пропозиції (поле чи база — дослівно, AC-ASSIST-04). */
  error: string | null;
}

let nextKey = 1;
function toItem(s: Suggestion): Item {
  const days = s.end === s.start ? [s.start] : [s.start, s.end];
  const time = s.closesAt == null ? "" : formatTime(s.closesAt);
  return { key: nextKey++, kind: s.kind === "early_dismissal" ? "early" : "days", name: s.name, dates: days, time, error: null };
}

const errorsOf = (item: Item): FieldErrors =>
  closureFieldErrors({ name: item.name, hasDates: closurePick(item.dates) != null, early: item.kind === "early", time: item.time });

const SPINNER = (
  <span aria-hidden="true" className="size-3.5 motion-safe:animate-spin rounded-full border-2 border-current border-r-transparent" />
);

/**
 * Помічник календаря (AC-ASSIST-01…10, design.md D1): текст календаря → «Suggest closures» → пропозиції, які людина
 * перевіряє, виправляє чи прибирає і лише тоді зберігає «Save closures». До збереження в календар не потрапляє нічого.
 */
export function AssistantForm({ today }: { today: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [request, requestAction, preparing] = useActionState(async (prev: AssistantState, form: FormData) => {
    const next = await requestSuggestions(prev, form);
    setItems(next.step === "suggestions" ? next.closures.map(toItem) : []);
    return next;
  }, { step: "idle" } as AssistantState);

  return (
    <div className="flex flex-col gap-6">
      <RequestForm action={requestAction} preparing={preparing} />
      {!preparing && request.step === "message" && <StateAlert tone={request.tone} message={request.message} />}
      {items.length > 0 && <SuggestionsForm items={items} setItems={setItems} today={today} />}
    </div>
  );
}

/** Текст календаря й «Suggest closures»: лічильник знаків (AC-ASSIST-10) і стан очікування (AC-ASSIST-08). */
function RequestForm({ action, preparing }: { action: (form: FormData) => void; preparing: boolean }) {
  const id = useId();
  const [text, setText] = useState("");
  const length = assistantTextLength(text);
  return (
    <Card>
      <CardHeader>
        <CardTitle>School calendar text</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={id}>Paste the text of the school calendar</Label>
              <span className={cn("text-xs tabular-nums text-muted-foreground", length > ASSISTANT_TEXT_MAX && "text-destructive")}>
                {length} / {ASSISTANT_TEXT_MAX}
              </span>
            </div>
            <Textarea
              id={id}
              name="text"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Winter break 28.12–08.01; Teachers' meeting 20.11 from 12:00"
            />
            <p className="text-xs text-muted-foreground">
              The assistant only suggests closures. Nothing is saved until you review the suggestions and save them.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* AC-ASSIST-08: поки помічник готує пропозиції — статус і вимкнена кнопка. */}
            <p role="status" className="text-sm text-muted-foreground empty:hidden">
              {preparing ? ASSISTANT_MESSAGES.preparing : ""}
            </p>
            <Button type="submit" disabled={preparing || !text.trim()} aria-busy={preparing || undefined}>
              {preparing ? SPINNER : <Sparkles aria-hidden="true" />}
              Suggest closures
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const ALERT_ICON = { warning: <TriangleAlert />, info: <Info />, destructive: <CircleAlert /> } as const;

/** Брак даних (AC-ASSIST-05), відмова (AC-ASSIST-06), недоступний (AC-ASSIST-09 — з ручним «Add closure»). */
function StateAlert({ tone, message }: { tone: keyof typeof ALERT_ICON; message: string }) {
  return (
    <Alert variant={tone} role="alert">
      {ALERT_ICON[tone]}
      <AlertDescription className="flex flex-col gap-2">
        <span>{message}</span>
        {message === ASSISTANT_MESSAGES.unavailable && (
          <Link href="/calendar/manage" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}>
            Add closure
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Пропозиції й «Save closures» (AC-ASSIST-02, -03, -04): лише ця дія людини пише в базу. Збережені зникають зі
 * списку, відхилені лишаються з повідомленням бази дослівно.
 */
function SuggestionsForm({
  items,
  setItems,
  today,
}: {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  today: string;
}) {
  const ids = useId();
  const [tried, setTried] = useState(false);
  const [save, saveAction, saving] = useActionState(async (prev: SaveState, form: FormData) => {
    const next = await saveSuggestions(prev, form);
    const failed = new Map(next.failed.map((f) => [f.index, f.message]));
    setItems((current) => current.flatMap((item, i) => (failed.has(i) ? [{ ...item, error: failed.get(i) ?? null }] : [])));
    return next;
  }, { failed: [], saved: 0 } as SaveState);
  const update = (key: number, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch, error: null } : item)));

  return (
    <form
      action={saveAction}
      noValidate
      onSubmit={(event) => {
        // Ті самі обов'язкові поля, що в «Add closure» (AC-CAL-18, AC-CAL-19); сервер перевіряє їх ще раз.
        if (items.every((item) => Object.values(errorsOf(item)).every((e) => e == null))) return;
        event.preventDefault();
        setTried(true);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {items.length} suggested {items.length === 1 ? "closure" : "closures"}
        </h2>
        <p className="text-sm text-muted-foreground">Not saved yet — review and save.</p>
      </div>
      <input type="hidden" name="count" value={items.length} />
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <SuggestionCard
            key={item.key}
            id={`${ids}-s${item.key}`}
            index={index}
            item={item}
            errors={tried ? errorsOf(item) : null}
            today={today}
            onChange={(patch) => update(item.key, patch)}
            onRemove={() => setItems((current) => current.filter((i) => i.key !== item.key))}
          />
        ))}
      </ul>
      {save.saved > 0 && (
        <Alert variant="info" role="status">
          <Info />
          <AlertDescription>
            {save.saved} {save.saved === 1 ? "closure was" : "closures were"} saved. The rest are below.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-2 max-md:sticky max-md:bottom-0 max-md:bg-background max-md:py-3">
        <Link href="/calendar" className={buttonVariants({ variant: "ghost" })}>
          Back
        </Link>
        <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
          {saving && SPINNER}
          {saving ? "Saving…" : "Save closures"}
        </Button>
      </div>
    </form>
  );
}

interface CardProps {
  id: string;
  index: number;
  item: Item;
  errors: FieldErrors | null;
  today: string;
  onChange: (patch: Partial<Item>) => void;
}

/** Одна пропозиція: назва, вид, дати й час — ті самі поля, що в «Add closure»; сховані поля з префіксом s<i>. */
function SuggestionCard({ onRemove, ...props }: CardProps & { onRemove: () => void }) {
  const { id, index, item } = props;
  const prefix = `s${index}.`;
  return (
    <li>
      <Card className="gap-4 px-5 py-4" aria-labelledby={`${id}-title`}>
        <div className="flex items-start justify-between gap-3">
          <h3 id={`${id}-title`} className="text-sm font-semibold">
            Suggestion {index + 1}
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove suggestion ${item.name || index + 1}`}>
            <X aria-hidden="true" />
            Remove suggestion
          </Button>
        </div>
        <HiddenFields prefix={prefix} item={item} />
        <div className="grid gap-4 md:grid-cols-2">
          <NameField {...props} prefix={prefix} />
          <KindField {...props} />
          <DatesField {...props} />
          {item.kind === "early" && <TimeField {...props} />}
        </div>
        {item.error && (
          <Alert variant="destructive" role="alert">
            <CircleAlert />
            <AlertDescription>{item.error}</AlertDescription>
          </Alert>
        )}
      </Card>
    </li>
  );
}

/** Поля, які читає parseClosureForm на сервері: kind, start/end або date, time — з префіксом пропозиції. */
function HiddenFields({ prefix, item }: { prefix: string; item: Item }) {
  const fields = { kind: item.kind, time: item.kind === "early" ? item.time : "", ...closureFields(item.kind, closurePick(item.dates)) };
  return Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={`${prefix}${name}`} value={value} />);
}

function NameField({ id, item, errors, onChange, prefix }: CardProps & { prefix: string }) {
  const error = errors?.name ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-name`}>Name</Label>
      <Input
        id={`${id}-name`}
        name={`${prefix}name`}
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-name-error` : undefined}
      />
      <FieldError id={`${id}-name-error`} message={error} />
    </div>
  );
}

const KIND_LABEL: Record<Kind, string> = { days: "Whole days", early: "Early dismissal" };

function KindField({ id, item, onChange }: CardProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-kind`} className="text-[13px] font-medium">
        Closed
      </span>
      <RadioGroup
        aria-labelledby={`${id}-kind`}
        value={item.kind}
        onValueChange={(value) => onChange({ kind: value as Kind, dates: item.dates.slice(0, value === "early" ? 1 : 2) })}
        className="flex flex-wrap gap-2"
      >
        {(["days", "early"] as const).map((k) => (
          <Label
            key={k}
            htmlFor={`${id}-kind-${k}`}
            className={cn(
              "min-h-11 items-center gap-2 rounded-md border border-border px-3 font-normal has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
              item.kind === k && "border-ring bg-accent",
            )}
          >
            <RadioGroupItem id={`${id}-kind-${k}`} value={k} />
            {KIND_LABEL[k]}
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

function DatesField({ id, item, errors, today, onChange }: CardProps) {
  const early = item.kind === "early";
  const error = errors?.dates ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-dates`} className="text-[13px] font-medium">
        {early ? "Date" : "Dates"}
      </span>
      <DatePickerField
        key={item.kind}
        mode={early ? "single" : "range"}
        value={item.dates}
        onChange={(dates) => onChange({ dates })}
        today={today}
        placeholder={early ? "Choose a date" : "Choose dates"}
        labelledBy={`${id}-dates`}
        describedBy={error ? `${id}-dates-error` : undefined}
        invalid={Boolean(error)}
      />
      <FieldError id={`${id}-dates-error`} message={error} />
    </div>
  );
}

function TimeField({ id, item, errors, onChange }: CardProps) {
  const error = errors?.time ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-time`}>Closed from</Label>
      <Input
        id={`${id}-time`}
        type="time"
        step={300}
        value={item.time}
        onChange={(e) => onChange({ time: e.target.value })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-time-error` : undefined}
      />
      <FieldError id={`${id}-time-error`} message={error} />
    </div>
  );
}
