// Знімки Overview із закриттям школи для docs/img/ і опису PR (вигляд, не AC PM): лише на прохання, UAT_SCREENSHOTS=1.
// Закриття створює секретним ключем на вільних днях показаних двох тижнів і прибирає за id (@prod-writes).
import { expect, test } from "@playwright/test";
import { addClosure, cleanupRemembered, freeOverviewDates } from "./support/admin";

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;
const THEMES = ["light", "dark"] as const;

test.describe("overview closures screenshots", { tag: ["@screenshots", "@prod-writes"] }, () => {
  test.beforeAll(async () => {
    const dates = await freeOverviewDates();
    expect(dates, "two working days of the shown weeks without closures").not.toBeNull();
    await addClosure("Autumn break", dates!.whole, dates!.whole);
    await addClosure("Teachers' meeting", dates!.early, dates!.early, 12 * 60);
  });

  test.afterAll(async () => {
    await cleanupRemembered();
  });

  for (const theme of THEMES) {
    for (const size of SIZES) {
      test(`overview with school closures at ${size.name} px, ${theme}`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({
          storageState: "playwright/.auth/teacher1.json",
          viewport: { width: size.width, height: size.height },
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
        const page = await context.newPage();
        await page.goto("/");
        await expect(page.getByRole("main").getByRole("link", { name: "School calendar" })).toBeVisible();
        await page.screenshot({ path: `docs/img/ws9-overview-closures-${size.name}-${theme}.png`, fullPage: true });
        await context.close();
      });
    }
  }
});
