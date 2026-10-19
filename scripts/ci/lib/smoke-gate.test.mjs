import { describe, expect, it } from "vitest";
import { decideSmokeRun } from "./smoke-gate.mjs";

const SHA = "2128e8339ef6c69c1ea6813aa95537f8254a778c";
const staging = { eventName: "deployment_status", deployedSha: SHA, environment: "Preview" };

describe("decideSmokeRun", () => {
  it("runs on Vercel's staging deployment, whose ref is a SHA and environment is Preview", () => {
    // QA F-08: run 38498440871 was exactly this event, and the old
    // `deployment.ref == 'staging'` condition skipped it silently.
    const d = decideSmokeRun({ ...staging, compareStatus: "identical", stagingUrl: "https://staging.example.com" });
    expect(d).toMatchObject({ run: true, fail: false });
  });

  it("still runs when staging has moved past the deployed commit", () => {
    expect(
      decideSmokeRun({ ...staging, compareStatus: "ahead", stagingUrl: "https://staging.example.com" }).run
    ).toBe(true);
  });

  it("skips a pull-request preview, and says so", () => {
    for (const compareStatus of ["behind", "diverged"]) {
      const d = decideSmokeRun({ ...staging, compareStatus, stagingUrl: "https://staging.example.com" });
      expect(d).toMatchObject({ run: false, fail: false });
      expect(d.reason).toMatch(/pull-request preview/);
    }
  });

  it("names the missing STAGING_URL on a staging deployment rather than skipping quietly", () => {
    const d = decideSmokeRun({ ...staging, compareStatus: "identical" });
    expect(d).toMatchObject({ run: false, fail: false });
    expect(d.reason).toMatch(/STAGING_URL is not set/);
  });

  it("fails when it could not ask GitHub -- couldn't check is not a no", () => {
    const d = decideSmokeRun({ ...staging, compareError: "HTTP 502", stagingUrl: "https://staging.example.com" });
    expect(d).toMatchObject({ run: false, fail: true });
  });

  it("never runs against production", () => {
    const d = decideSmokeRun({ ...staging, environment: "Production", compareStatus: "identical", stagingUrl: "https://x.example.com" });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/production/);
  });

  it("a manual run always checks, and the smoke script fails it when STAGING_URL is missing", () => {
    expect(decideSmokeRun({ eventName: "workflow_dispatch" })).toMatchObject({ run: true, fail: false });
  });
});
