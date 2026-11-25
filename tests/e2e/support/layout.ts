// Без прокрутки сторінки вбік на телефоні (DESIGN.md, розділ 12; ADR 0008).
//
// Міряємо, коли розкладка встоялась: спершу шрифти (`document.fonts.ready`), потім кілька замірів до `timeout`.
// Чому: одноразовий замір одразу після появи вмісту іноді ловив +10 px на «My substitutions» (main, run 45625654255),
// хоча знімок того самого кадру — без переповнення: текст ще в запасному шрифті ширший, ніж у Geist. Стійке
// переповнення ця перевірка й далі ловить, а в повідомленні називає елементи, що виходять за правий край.
import { expect, type Page } from "@playwright/test";

function overflow(page: Page): Promise<number> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
}

function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const edge = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const right = el.getBoundingClientRect().right;
      if (right > edge + 0.5) {
        const id = el.getAttribute("data-testid") ?? el.getAttribute("data-slot") ?? "";
        out.push(`${el.tagName.toLowerCase()}${id ? `[${id}]` : ""} right=${Math.round(right)}`);
      }
      if (out.length >= 10) break;
    }
    return out;
  });
}

export async function expectNoSidewaysScroll(page: Page, timeout = 3000) {
  try {
    await expect.poll(() => overflow(page), { timeout }).toBeLessThanOrEqual(0);
  } catch (error) {
    const list = await offenders(page);
    throw new Error(`The page scrolls sideways. Elements past the right edge: ${list.join(", ") || "none found"}`, {
      cause: error,
    });
  }
}
