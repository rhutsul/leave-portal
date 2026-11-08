// Прибирання після прогону (teardown проєкту setup): видаляє все, що створили тести шкільного календаря (журнал
// tests/e2e/support/admin.ts), і падає, якщо у вікнах дат AC лишилось закриття з назвою AC чи запис teacher1@.
// Підсумок — у test-results/uat-cleanup.json (його читає звіт UAT, рядок «Прибирання»).
// Без SUPABASE_SECRET_KEY (прогін лише AC, що нічого не пишуть) тесту немає.
// Джерело каркаса: матеріали курсу WS9, materials/uat/tests/e2e/cleanup.teardown.ts.
import { writeFileSync } from "node:fs";
import { expect, test as teardown } from "@playwright/test";
import { cleanupCalendar, hasAdminKey } from "./support/admin";

if (hasAdminKey()) {
  teardown("прибирання: закриття й записи UAT шкільного календаря", async () => {
    const result = await cleanupCalendar();
    writeFileSync(
      "test-results/uat-cleanup.json",
      JSON.stringify({ at: new Date().toISOString(), scope: "school-calendar", ...result }, null, 2),
    );
    expect(result.remaining, "лишились закриття UAT").toEqual([]);
    expect(result.leftoverRequests, "лишились записи teacher1@ у датах AC").toBe(0);
  });
}
