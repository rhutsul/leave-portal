// /status (WS11): минулі збої ПРОДУ людською мовою — пише черговий розробник після postmortem (docs/incidents/).
// Навчальні дрілі на staging сюди не потрапляють: сторінка показує стан проду, яким користуються люди.
// Без імен, адрес і технічних деталей: що бачили користувачі, скільки тривало, що зараз.

export type Incident = {
  /** Дата початку за Києвом, YYYY-MM-DD. */
  date: string;
  /** Коротко, що бачили люди, sentence case: «Sign-in was unavailable». */
  title: string;
  /** Одне-два речення: вплив, тривалість, стан. */
  summary: string;
};

export const INCIDENTS: Incident[] = [];

/** Збої за останні `days` днів, найновіші першими. */
export function recentIncidents(incidents: Incident[], today: string, days = 30): Incident[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return incidents.filter((i) => i.date >= from && i.date <= today).toSorted((a, b) => b.date.localeCompare(a.date));
}
