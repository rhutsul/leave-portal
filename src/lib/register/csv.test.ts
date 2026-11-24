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
  it("starts with a BOM, a title and the header, ends every line with CRLF", () => {
    const csv = registerCsv([row()], "Elementary school · November 2026");
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM.codePointAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    const [title, header] = lines(csv);
    expect(title).toBe("Elementary school · November 2026");
    expect(header).toBe(CSV_HEADER.join(","));
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
      "High school · November 2026",
    );
    const [, , first, second, blank, total] = lines(csv);
    expect(first).toBe(
      "Андрій Демо-Вчитель-Перший,teacher1@example.test,Teacher,Main,2026-11-03,Whole day,08:30,15:30,7.00," +
        "Personal leave,1.00,0.00,Ірина Демо-Менеджер-Перша,2026-11-02 12:15",
    );
    expect(second).toBe(
      '"Doe, Jane",teacher1@example.test,Math teacher,Additional,2026-11-03,15:45–17:00,15:45,17:00,1.25,' +
        "Unpaid leave,0.00,0.15,,",
    );
    expect(blank).toBe("");
    expect(total).toBe("Total,2 records,,,,,,,8.25,,1.00,0.15,,");
  });

  it("writes only the title, header and a zero total for an empty month", () => {
    const all = lines(registerCsv([], "High school · December 2026"));
    expect(all).toHaveLength(4);
    expect(all[3]).toBe("Total,0 records,,,,,,,0.00,,0.00,0.00,,");
  });

  it("speaks of one record in the singular and treats missing days as zero", () => {
    const all = lines(registerCsv([row({ paid_days: null, unpaid_days: null })], "x"));
    expect(all[2]).toContain(",Personal leave,0.00,0.00,");
    expect(all[4]).toBe("Total,1 record,,,,,,,7.00,,0.00,0.00,,");
  });

  it("protects names that look like formulas", () => {
    const all = lines(registerCsv([row({ employee_name: "=cmd|' /C calc'!A0" })], "x"));
    expect(all[2].startsWith("'=cmd|' /C calc'!A0,")).toBe(true);
  });
});
