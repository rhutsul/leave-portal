// Стан форми «New request» (D6): дати → посади й години → тип і коментар → підсумок. Чистий reducer, щоб
// повернення з підсумку до редагування (AC-LEAVE-11) перевіряв тест, а не лише браузер.
// Нічого не зберігає: заявку створює лише server action після «Confirm request».

import type { DateChoice, LeaveType, PositionChoice } from "./request";

export type Step = 1 | 2 | 3 | 4;

export interface Draft {
  step: Step;
  /** Найдальший пройдений крок: на нього можна повернутися зі степера без повторного введення. */
  maxStep: Step;
  /** Вибрані дати "YYYY-MM-DD" за зростанням. */
  dates: string[];
  /** Вибір посади на дату, ключ — choiceKey(date, positionId). Лишається й після прибирання дати. */
  choices: Record<string, PositionChoice>;
  leaveType: LeaveType | null;
  relationship: string;
  comment: string;
}

export type DraftAction =
  | { type: "toggleDate"; date: string }
  | { type: "setChoice"; date: string; positionId: number; patch: Partial<Omit<PositionChoice, "positionId">> }
  | { type: "setLeaveType"; leaveType: LeaveType }
  | { type: "setRelationship"; relationship: string }
  | { type: "setComment"; comment: string }
  | { type: "go"; step: Step };

export const EMPTY_DRAFT: Draft = {
  step: 1,
  maxStep: 1,
  dates: [],
  choices: {},
  leaveType: null,
  relationship: "",
  comment: "",
};

export function choiceKey(date: string, positionId: number): string {
  return `${date}|${positionId}`;
}

/** Вибір посади на дату; поки працівник нічого не змінив — посада включена на цілий день. */
export function choiceFor(draft: Draft, date: string, positionId: number): PositionChoice {
  return draft.choices[choiceKey(date, positionId)] ?? { positionId, include: true, wholeDay: true, start: "", end: "" };
}

// Зміна на кроці робить наступні кроки недоступними, доки їх не пройдено знову: підсумок завжди показує
// перевірене введене.
const edited = (draft: Draft, at: Step): Draft => ({ ...draft, maxStep: draft.maxStep > at ? at : draft.maxStep });

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "toggleDate": {
      const dates = draft.dates.includes(action.date)
        ? draft.dates.filter((d) => d !== action.date)
        : [...draft.dates, action.date].sort();
      return edited({ ...draft, dates }, 1);
    }
    case "setChoice": {
      const key = choiceKey(action.date, action.positionId);
      const current = choiceFor(draft, action.date, action.positionId);
      return edited({ ...draft, choices: { ...draft.choices, [key]: { ...current, ...action.patch } } }, 2);
    }
    case "setLeaveType":
      return edited({ ...draft, leaveType: action.leaveType }, 3);
    case "setRelationship":
      return edited({ ...draft, relationship: action.relationship }, 3);
    case "setComment":
      return edited({ ...draft, comment: action.comment }, 3);
    case "go":
      // Уперед — лише після перевірки кроку в компоненті; назад і на пройдені кроки — завжди, без втрати введеного.
      return { ...draft, step: action.step, maxStep: action.step > draft.maxStep ? action.step : draft.maxStep };
  }
}

/** Що форма надсилає server action: лише вибрані дати й вибір посад на них. */
export interface RequestPayload {
  dates: string[];
  leaveType: string;
  relationship: string;
  comment: string;
  choices: DateChoice[];
}

/** positionIdsOn — id посад, що мають розклад у дату (з positionsOnDate). */
export function toPayload(draft: Draft, positionIdsOn: (date: string) => number[]): RequestPayload {
  return {
    dates: draft.dates,
    leaveType: draft.leaveType ?? "",
    relationship: draft.relationship,
    comment: draft.comment,
    choices: draft.dates.flatMap((date) => positionIdsOn(date).map((id) => ({ ...choiceFor(draft, date, id), date }))),
  };
}
