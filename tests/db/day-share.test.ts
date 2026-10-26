// Частка дня — дві реалізації однієї формули: dayShare (src/lib/leave/balance.ts, залишки й попередження в застосунку)
// і private.day_share (міграція 20261021133002_leave_decisions.sql, рішення менеджера й розподіл у базі). Ті самі
// випадки проганяємо через обидві, щоб зміна округлення чи межі 1.00 в одному шарі не розійшлася з другим мовчки.
// Execute на private.day_share відкликано в public, anon і authenticated, схема private застосунку не видна — тож
// запит через сирий t.db (власник бази), а не asUser / asService.
import { beforeAll, describe, expect, it } from "vitest";
import { dayShare } from "@/lib/leave/balance";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;

beforeAll(async () => {
  t = await createLeaveDb();
}, 60_000);

/** [хвилини записів, робочі хвилини дня, частка в сотих]. */
type Case = readonly [minutes: number, working: number, expected: number];

async function expectBothAgree(cases: readonly Case[]) {
  for (const [minutes, working, expected] of cases) {
    const { rows } = await t.db.query<{ share: number }>("select private.day_share($1, $2) as share", [minutes, working]);
    expect({ minutes, working, ts: dayShare(minutes, working), sql: rows[0].share }).toEqual({
      minutes,
      working,
      ts: expected,
      sql: expected,
    });
  }
}

describe("TS dayShare and SQL private.day_share give the same day share", () => {
  it("AC-BALANCE-02: a whole day of 420 minutes counts as 1.00", async () => {
    await expectBothAgree([[420, 420, 100]]);
  });

  it("AC-BALANCE-03: 09:00–11:30 of 420 minutes counts as 0.36", async () => {
    await expectBothAgree([[150, 420, 36]]);
  });

  it("AC-BALANCE-05: whole days on both positions (420 + 75 of 495 minutes) count as 1.00", async () => {
    await expectBothAgree([[420 + 75, 495, 100]]);
  });

  it("AC-BALANCE-06: a whole day of the additional position only counts as 0.15 (75 of 495 minutes)", async () => {
    await expectBothAgree([[75, 495, 15]]);
  });

  it("rounding half up to 0.01, the 1.00 cap and empty days agree in both layers", async () => {
    await expectBothAgree([
      [71, 200, 36], // 0.355 → 0.36
      [1, 200, 1], // 0.005 → 0.01
      [1, 300, 0], // 0.0033 → 0.00
      [199, 200, 100], // 0.995 → 1.00
      [210, 420, 50],
      [500, 420, 100],
      [990, 495, 100], // ніколи не більше 1.00 за дату
      [0, 420, 0],
      [60, 0, 0],
      [-30, 420, 0],
    ]);
  });
});
