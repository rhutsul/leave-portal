// AC-ASSIST-08: поки помічник готує пропозиції — «Preparing suggestions…» і вимкнена «Suggest closures».
// У репо немає DOM-середовища для тестів (jsdom, Testing Library), тож форму рендеримо renderToStaticMarkup, а стан
// «дія ще виконується» задаємо прапорцем pending з useActionState — саме його повертає React, поки requestSuggestions
// не відповіла (запустити справжню дію й зачекати без DOM неможливо). Текст у полі підставлено, щоб кнопку вимикав
// саме pending, а не порожнє поле.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ requestPending: false, text: "Winter break 28.12–08.01; Teachers' meeting 20.11 from 12:00" }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  let call = 0;
  return {
    ...actual,
    // Перший useActionState у формі — «Suggest closures» (requestSuggestions), другий — «Save closures».
    useActionState: (action: unknown, initial: unknown) => [initial, action, call++ % 2 === 0 && h.requestPending],
    // Порожній рядок — лише початкове значення поля тексту календаря.
    useState: (initial: unknown) => actual.useState(initial === "" ? h.text : initial),
  };
});
// Справжні дії імпортуються, але під час рендеру не викликаються; зовнішнє, що вони тягнуть, — підмінено.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { AssistantForm } = await import("./assistant-form");

/** Кнопка «Suggest closures» — від `<button` до її підпису. */
function suggestButton(html: string): string {
  const end = html.indexOf("Suggest closures");
  return html.slice(html.lastIndexOf("<button", end), end);
}

beforeEach(() => {
  h.requestPending = false;
});

describe("AssistantForm", () => {
  it("AC-ASSIST-08: while the assistant has not answered, 'Preparing suggestions…' is shown and Suggest closures is disabled", () => {
    h.requestPending = true;
    const html = renderToStaticMarkup(<AssistantForm today="2026-11-13" />);
    expect(html).toContain("Preparing suggestions…");
    expect(suggestButton(html)).toMatch(/\sdisabled=""/);
    expect(suggestButton(html)).toContain('aria-busy="true"');
  });

  it("AC-ASSIST-08: once the assistant has answered, the status is gone and suggestions can be asked again", () => {
    const html = renderToStaticMarkup(<AssistantForm today="2026-11-13" />);
    expect(html).not.toContain("Preparing suggestions…");
    expect(suggestButton(html)).not.toMatch(/\sdisabled=""/);
    expect(html).toContain("Winter break 28.12–08.01");
  });
});
