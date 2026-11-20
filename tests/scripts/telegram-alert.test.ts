// scripts/telegram-alert.mjs — текст алерту з червоного smoke (WS11, трек B). Тест інструмента — без AC ID.
// Лише чисте форматування: мережі й Telegram немає.
import { describe, expect, it } from "vitest";
import { escapeHtml, formatAlert, hostOf } from "../../scripts/telegram-alert.mjs";

const base = {
  repository: "rhutsul/leave-portal",
  workflow: "smoke",
  job: "deploy",
  env: "preview",
  branch: "staging",
  url: "https://leave-portal-git-staging-rh-3ddc.vercel.app",
  sha: "86146db7ffc2d7d10da4ce95ebddd812e109fe88",
  runUrl: "https://github.com/rhutsul/leave-portal/actions/runs/1",
};

describe("telegram-alert: alert text", () => {
  it("shows environment with branch, host only, short commit, job, the first reason and the run link", () => {
    const text = formatAlert({ ...base, failures: ['"/api/health": appEnv=немає, а очікувався staging', "друга причина", ""] });
    expect(text).toContain("🔴 <b>Червоний smoke</b> · leave-portal");
    expect(text).toContain("<b>Середовище:</b> preview (гілка staging)");
    expect(text).toContain("<b>Адреса:</b> leave-portal-git-staging-rh-3ddc.vercel.app");
    expect(text).toContain("<b>Коміт:</b> <code>86146db</code>");
    expect(text).toContain("<b>Job:</b> smoke / deploy");
    expect(text).toContain("<b>Що впало:</b> &quot;/api/health&quot;: appEnv=немає, а очікувався staging (і ще 1)");
    expect(text).toContain('<a href="https://github.com/rhutsul/leave-portal/actions/runs/1">Відкрити прогін</a>');
  });

  it("omits the commit and the reason lines when there are none (manual run without sha)", () => {
    const text = formatAlert({ ...base, env: "manual", branch: "", sha: "", url: "https://example.invalid" });
    expect(text).not.toContain("Коміт");
    expect(text).not.toContain("Що впало");
    expect(text).toContain("<b>Середовище:</b> manual\n");
    expect(text).toContain("<b>Адреса:</b> example.invalid");
  });

  it("escapes HTML in every value so Telegram cannot misparse it", () => {
    const text = formatAlert({ ...base, branch: "a<b>&c", failures: ["x <script> & y"] });
    expect(text).toContain("(гілка a&lt;b&gt;&amp;c)");
    expect(text).toContain("x &lt;script&gt; &amp; y");
    expect(escapeHtml('"&<>')).toBe("&quot;&amp;&lt;&gt;");
  });

  it("never shows the path, query, fragment or credentials of the deployment address", () => {
    expect(hostOf("https://user:secret@host.vercel.app/path?x-vercel-protection-bypass=abc#f")).toBe("host.vercel.app");
    expect(hostOf("host.vercel.app/api/health")).toBe("host.vercel.app");
    expect(hostOf("https://user:pa@ss@tail@host.vercel.app/path")).toBe("host.vercel.app");
    expect(hostOf("")).toBe("");
    const text = formatAlert({ ...base, url: "https://host.vercel.app/?token=abc" });
    expect(text).not.toContain("token=abc");
  });

  it("cuts a very long reason", () => {
    const text = formatAlert({ ...base, failures: ["x".repeat(500)] });
    expect(text).toContain(`${"x".repeat(300)}…`);
    expect(text).not.toContain("x".repeat(301));
  });
});
