// CSV реєстру погоджених відсутностей (ADR 0012) — ініціатива розробника до вимог PM, тож без AC ID у назвах.
import { describe, expect, it } from "vitest";
import { CSV_BOM, CSV_HEADER, csvCell, csvLine, registerCsv } from "./csv";
import type { RegisterRow } from "./register";

function row(overrides: Partial<RegisterRow> = {}): RegisterRow {
  return {
    record_id: 1,
    employee_name: "Андрій Демо-Вчитель-Перший",
    employee_email: "teacher1@example.test",
    position_title: "Teacher",
    position_kind: "main",
    date: "2026-11-03",
    start_min: 510,
    end_min: 930,
    minutes: 420,
    whole_day: true,
    leave_type: "personal",
    paid_days: "1.00",
    unpaid_days: "0.00",
    approved_at: "2026-11-02T10:15:00Z",
    approved_by_name: "Ірина Демо-Менеджер-Перша",
    ...overrides,
  };
}

/** Рядки файлу без BOM і кінцевого переносу. */
const lines = (csv: string) => csv.slice(CSV_BOM.length).replace(/\r\n$/, "").split("\r\n");

describe("CSV cells", () => {
  it("leaves plain text as is", () => {
    expect(csvCell("Teacher")).toBe("Teacher");
    expect(csvCell(7)).toBe("7");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("2026-11-03")).toBe("2026-11-03");
  });

  it("quotes commas, quotes and line breaks, doubling the quotes", () => {
    expect(csvCell("Smith, John")).toBe('"Smith, John"');
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(csvCell("one\r\ntwo")).toBe('"one\r\ntwo"');
  });

  it("stops a cell from becoming a formula in a spreadsheet", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("\rx")).toBe("\"'\rx\"");
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
    expect(csvCell("a=b")).toBe("a=b");
  });

  it("joins cells with commas", () => {
    expect(csvLine(["a", "b,c", null])).toBe('a,"b,c",');
  });
});

describe("register CSV", () => {
  it("is a clean table: a BOM, the header first, CRLF after every line", () => {
    const csv = registerCsv([row()]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM.codePointAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    const all = lines(csv);
    expect(all[0]).toBe(CSV_HEADER.join(","));
    expect(all).toHaveLength(2);
  });

  it("writes one line per record with every column", () => {
    const csv = registerCsv(
      [
        row(),
        row({
          record_id: 2,
          employee_name: "Doe, Jane",
          position_kind: "additional",
          position_title: "Math teacher",
          whole_day: false,
          start_min: 945,
          end_min: 1020,
          minutes: 75,
          leave_type: "unpaid",
          paid_days: 0,
          unpaid_days: "0.15",
          approved_at: null,
          approved_by_name: null,
        }),
      ],
    );
    const [, first, second, ...rest] = lines(csv);
    expect(first).toBe(
      "Андрій Демо-Вчитель-Перший,teacher1@example.test,Teacher,Main,2026-11-03,Whole day,08:30,15:30,7.00," +
        "Personal leave,1.00,0.00,Ірина Демо-Менеджер-Перша,2026-11-02 12:15",
    );
    expect(second).toBe(
      '"Doe, Jane",teacher1@example.test,Math teacher,Additional,2026-11-03,15:45–17:00,15:45,17:00,1.25,' +
        "Unpaid leave,0.00,0.15,,",
    );
    // Без порожнього рядка й рядка «Total»: підсумок — лише на сторінці.
    expect(rest).toEqual([]);
  });

  it("writes only the header for an empty month", () => {
    expect(lines(registerCsv([]))).toEqual([CSV_HEADER.join(",")]);
  });

  it("treats missing days as zero", () => {
    const all = lines(registerCsv([row({ paid_days: null, unpaid_days: null })]));
    expect(all[1]).toContain(",Personal leave,0.00,0.00,");
  });

  it("protects names that look like formulas", () => {
    const all = lines(registerCsv([row({ employee_name: "=cmd|' /C calc'!A0" })]));
    expect(all[1].startsWith("'=cmd|' /C calc'!A0,")).toBe(true);
  });
});
