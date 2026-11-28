// scripts/check-build-ref.mjs (prebuild): preview і staging збираються лише з базою staging — дія 2 postmortem 2026-11-20
// (rhutsul/leave-portal#145), рев'ю викладача WS11, пункт 3. Тест інструмента — без AC ID.
import { describe, expect, it } from "vitest";
import { buildRefProblem, refOf } from "../../scripts/check-build-ref.mjs";
import { repoRoot, runScript } from "./run-script";

const STAGING = "https://tgvhqyboeeusptbjskio.supabase.co";
// Хибний символ у кінці ref — саме такий був дріл 2026-11-20.
const DRILL = "https://tgvhqyboeeusptbjskix.supabase.co";
const PROD = "https://jfuyhspluullwcrimszx.supabase.co";

describe("check-build-ref", () => {
  it("reads the project ref from a Supabase URL and nothing from other URLs", () => {
    expect(refOf(STAGING)).toBe("tgvhqyboeeusptbjskio");
    expect(refOf("https://example.com")).toBe("");
    expect(refOf("not a url")).toBe("");
  });

  it("does nothing locally, in CI and for production (no VERCEL_ENV=preview, no APP_ENV=staging)", () => {
    expect(buildRefProblem({ NEXT_PUBLIC_SUPABASE_URL: DRILL })).toBeNull();
    expect(buildRefProblem({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD })).toBeNull();
  });

  it("passes the staging branch and a PR preview that use the staging database", () => {
    expect(buildRefProblem({ APP_ENV: "staging", VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: STAGING })).toBeNull();
    expect(buildRefProblem({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: STAGING })).toBeNull();
  });

  it("stops the build of the 2026-11-20 drill: one wrong character in the ref, named by the variable", () => {
    const problem = buildRefProblem({ APP_ENV: "staging", VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: DRILL });
    expect(problem).toContain("NEXT_PUBLIC_SUPABASE_URL веде в проєкт tgvhqyboeeusptbjskix");
    expect(problem).toContain("staging (tgvhqyboeeusptbjskio)");
  });

  it("stops a preview that talks to the production database, and a missing or broken URL", () => {
    expect(buildRefProblem({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: PROD })).toContain("jfuyhspluullwcrimszx");
    expect(buildRefProblem({ VERCEL_ENV: "preview" })).toContain("не задана");
    expect(buildRefProblem({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://example.com" })).toContain("не схожа");
  });

  it("takes the expected ref from SUPABASE_STAGING_REF when it is set", () => {
    expect(
      buildRefProblem({ VERCEL_ENV: "preview", SUPABASE_STAGING_REF: "tgvhqyboeeusptbjskix", NEXT_PUBLIC_SUPABASE_URL: DRILL }),
    ).toBeNull();
  });

  it("as prebuild: exit code 1 and an ::error line without the key values; 0 outside preview", () => {
    const failed = runScript("check-build-ref.mjs", repoRoot, {
      VERCEL_ENV: "preview",
      APP_ENV: "staging",
      NEXT_PUBLIC_SUPABASE_URL: DRILL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_should_not_be_printed",
      SUPABASE_STAGING_REF: "",
    });
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("::error title=build::NEXT_PUBLIC_SUPABASE_URL");
    expect(failed.out).not.toContain("sb_publishable_should_not_be_printed");
    const local = runScript("check-build-ref.mjs", repoRoot, { VERCEL_ENV: "", APP_ENV: "", NEXT_PUBLIC_SUPABASE_URL: DRILL });
    expect(local.code).toBe(0);
  });
});
