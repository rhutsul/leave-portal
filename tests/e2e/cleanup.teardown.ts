// Прибирання після прогону (teardown проєкту setup): видаляє все, що створили тести шкільного календаря (журнал
// tests/e2e/support/admin.ts), і падає, якщо у вікнах дат AC лишилось закриття з назвою AC чи запис teacher1@.
// Підсумок — у test-results/uat-cleanup.json (його читає звіт UAT, рядок «Прибирання»).
// Без SUPABASE_SECRET_KEY (прогін лише AC, що нічого не пишуть) тесту немає.
// Джерело каркаса: матеріали курсу WS9, materials/uat/tests/e2e/cleanup.teardown.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as teardown } from "@playwright/test";
import { cleanupCalendar, hasAdminKey } from "./support/admin";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

if (hasAdminKey()) {
  teardown("прибирання: закриття й записи UAT шкільного календаря", async () => {
    const file = "test-results/uat-cleanup.json";
    mkdirSync("test-results", { recursive: true });
    let result: Awaited<ReturnType<typeof cleanupCalendar>>;
    try {
      result = await cleanupCalendar();
    } catch (error) {
      // Прибирання почалось і впало: звіт має сказати саме це, а не «не запускалось».
      writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), scope: "school-calendar", error: errorText(error) }, null, 2));
      throw error;
    }
    writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), scope: "school-calendar", ...result }, null, 2));
    expect(result.remaining, "лишились закриття UAT").toEqual([]);
    expect(result.leftoverRequests, "лишились записи teacher1@ у датах AC").toBe(0);
  });
}
