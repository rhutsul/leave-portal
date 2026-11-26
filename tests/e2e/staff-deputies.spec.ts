// Заступники (вимога PM 07; PR 3 плану impl-staff-management, задача 3.3): порожній список, призначення на період, що
// включає сьогодні (manager2@ бачить і погоджує запис посади manager1@), період у майбутньому (не бачить), спроба
// менеджера призначити себе в обхід сторінок. AC називають сталі дати — тут «сьогодні» за Києвом (права діють, поки
// сьогодні в періоді). Лише на одноразовому стеку CI (@writes); призначення й записи прибирає afterAll.
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { kyivDate } from "../../src/lib/leave/time";
import { addRecord, adminClient, cleanupRemembered } from "./support/admin";
import { roleContext } from "./support/cancel";
import { clickDate } from "./support/calendar";
import { cleanScreenshot } from "./support/uat";

test.use({ storageState: "playwright/.auth/admin.json", colorScheme: "light" });

const shot = (page: Page, name: string, fullPage = false) =>
  cleanScreenshot(page, test.info().outputPath(`ws11-staff-${name}-1280-light.png`), fullPage);

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function choosePerson(page: Page, label: string, email: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: email }).click();
}

async function assign(page: Page, start: string, end: string) {
  await page.goto("/staff/deputies");
  await choosePerson(page, "Absent manager", "manager1@example.test");
  await choosePerson(page, "Deputy", "manager2@example.test");
  await clickDate(page, start);
  await clickDate(page, end);
  await page.getByRole("button", { name: "Assign deputy" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deputy assigned." })).toBeVisible();
}

async function removeAll() {
  const { error } = await adminClient().from("deputy_assignments").delete().gte("id", 0);
  expect(error).toBeNull();
}

test.describe("deputies @writes", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await removeAll();
    await cleanupRemembered();
  });

  const today = kyivDate(new Date());
  // Запис teacher1@ на основній посаді (лише manager1@ відповідає за неї) — далеко від дат інших тестів.
  const recordDate = addDays(today, 45);

  test("AC-STAFF-19: with no deputy assigned the list says so", async ({ page }) => {
    await removeAll();
    await page.goto("/staff/deputies");
    await expect(page.getByText("No deputies assigned")).toBeVisible();
    await shot(page, "deputies-empty", true);
  });

  test("AC-STAFF-09: while today is in the period, manager2 sees and approves manager1's record, and manager1 still sees it", async ({ browser, page }) => {
    const record = await addRecord("teacher1@example.test", { date: recordDate, start: 510, end: 930, leaveType: "personal", status: "awaiting" });
    await assign(page, today, addDays(today, 3));
    await expect(page.getByTestId("deputy-row")).toContainText("Current");
    await shot(page, "deputies", true);

    const managerContext = await roleContext(browser, "manager1");
    const deputyContext = await roleContext(browser, "manager2");
    try {
      const manager = await managerContext.newPage();
      await manager.goto(`/decisions?record=${record}`);
      await expect(manager.locator(`[data-record-row="${record}"]`)).toBeVisible();

      const deputy = await deputyContext.newPage();
      await deputy.goto(`/decisions?record=${record}`);
      await expect(deputy.locator(`[data-record-row="${record}"]`)).toBeVisible();
      await deputy.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(deputy.getByRole("dialog")).toBeVisible();
      await deputy.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
      await expect
        .poll(async () => (await adminClient().from("leave_records").select("status").eq("id", record).single()).data?.status)
        .toBe("approved");
    } finally {
      await managerContext.close();
      await deputyContext.close();
    }
  });

  test("AC-STAFF-10: outside the period manager2 does not see any record of teacher1", async ({ browser, page }) => {
    await removeAll();
    const record = await addRecord("teacher1@example.test", {
      date: addDays(recordDate, 1),
      start: 510,
      end: 930,
      leaveType: "personal",
      status: "awaiting",
    });
    await assign(page, addDays(today, 1), addDays(today, 3));
    await expect(page.getByTestId("deputy-row")).toContainText("Upcoming");
    const deputyContext = await roleContext(browser, "manager2");
    try {
      const deputy = await deputyContext.newPage();
      await deputy.goto("/decisions");
      await expect(deputy.locator(`[data-record-row="${record}"]`)).toHaveCount(0);
    } finally {
      await deputyContext.close();
    }
  });

  test("AC-STAFF-14: manager1 cannot assign themselves as a deputy bypassing the pages", async () => {
    await removeAll();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: "manager1@example.test",
      password: process.env.DEMO_USER_PASSWORD ?? "",
    });
    expect(signInError).toBeNull();
    const { data: me } = await supabase.auth.getUser();
    const { data: other } = await adminClient().from("profiles").select("id").eq("email", "manager2@example.test").single();
    const insert = await supabase
      .from("deputy_assignments")
      .insert({ manager_id: other!.id, deputy_id: me.user!.id, start_date: today, end_date: today });
    expect(insert.error).not.toBeNull();
    const rpc = await supabase.rpc("assign_deputy", { p_manager_id: other!.id, p_deputy_id: me.user!.id, p_start: today, p_end: today });
    expect(rpc.error?.message).toBe("Only an administrator can manage employees");
    const { count } = await adminClient().from("deputy_assignments").select("id", { count: "exact", head: true });
    expect(count).toBe(0);
  });
});
