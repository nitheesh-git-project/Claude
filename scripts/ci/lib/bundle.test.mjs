import { describe, expect, it } from "vitest";
import { UNTRUSTED_NOTICE, buildFailureBundle, reproCommand } from "./bundle.mjs";

const manifest = {
  specs: { "pay-later.spec.ts": {} },
  flows: [{ id: "patient.pay-later", runner: "patient", rules: ["docs/rules/pay-later.md"], coverage: [{ spec: "pay-later.spec.ts" }] }],
};

describe("buildFailureBundle", () => {
  const summary = {
    status: "failed",
    identity: { commit: "abc123", runId: "9", stack: "local" },
    counts: { total: 4, failed: 1 },
    problems: ["the egress guard refused 1 outbound request(s)"],
    preflight: [],
    egressDenials: ["2026 fetch host=www.googleapis.com https://www.googleapis.com/calendar :: not allowed"],
    failures: [
      {
        file: "/w/e2e/pay-later.spec.ts",
        title: "PL-UI-003: owed figure > shows",
        project: "desktop",
        reason: "unexpected",
        step: "expect.toHaveText",
        error: "Authorization: Bearer abc.def.ghijklmnop failed for someone@gmail.com",
      },
    ],
    scripts: [{ script: "scripts/pay-later-sql-checks.sql", exitCode: 3 }],
    limitations: [],
  };

  it("opens with the untrusted-data notice and carries a reproduction per failure", () => {
    const md = buildFailureBundle({ runner: "patient", summary, manifest, changedFiles: ["src/lib/payLater.ts"] });
    expect(md.indexOf(UNTRUSTED_NOTICE)).toBeGreaterThan(0);
    expect(md).toContain('npx playwright test e2e/pay-later.spec.ts --project=desktop -g "PL-UI-003"');
    expect(md).toContain("`patient.pay-later`");
    expect(md).toContain("`docs/rules/pay-later.md`");
    expect(md).toContain("`src/lib/payLater.ts`");
    expect(md).toContain('psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/pay-later-sql-checks.sql');
  });

  it("sanitises the error text it carries", () => {
    const md = buildFailureBundle({ runner: "patient", summary, manifest, changedFiles: [] });
    expect(md).not.toContain("abc.def.ghijklmnop");
    expect(md).not.toContain("someone@gmail.com");
  });

  it("says the runner never finished when there is no summary", () => {
    const md = buildFailureBundle({ runner: "admin", summary: null, manifest, changedFiles: [] });
    expect(md).toContain("wrote no summary.json");
    expect(md).toContain("node scripts/ci/run-runner.mjs admin");
  });
});

describe("reproCommand", () => {
  it("falls back to the whole file when the title has no id", () => {
    expect(reproCommand({ file: "e2e/x.spec.ts", title: "loads", project: "mobile" })).toBe("npx playwright test e2e/x.spec.ts --project=mobile");
  });
});
