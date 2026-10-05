import { describe, expect, it } from "vitest";
import { REQUIRED_JOBS, REQUIRED_RUNNERS, evaluateGate, renderGateMarkdown } from "./gate.mjs";

const allSuccess = () => Object.fromEntries(REQUIRED_JOBS.map((j) => [j, { result: "success" }]));
const passedSummary = (runner, total = 5) => ({ runner, status: "passed", passed: true, counts: { total } });
const allPassed = () => Object.fromEntries(REQUIRED_RUNNERS.map((r) => [r, passedSummary(r)]));
const failedRows = (v) => v.rows.filter((r) => !r.ok).map((r) => r.name);

describe("evaluateGate", () => {
  it("passes only when every job succeeded and every runner passed with tests", () => {
    const v = evaluateGate(allSuccess(), allPassed());
    expect(v.ok).toBe(true);
    expect(v.rows).toHaveLength(REQUIRED_JOBS.length + REQUIRED_RUNNERS.length);
  });

  for (const result of ["failure", "skipped", "cancelled", "timed_out", "", null]) {
    it(`treats a required job that is "${result}" as a failure`, () => {
      const needs = allSuccess();
      needs.runner = { result };
      const v = evaluateGate(needs, allPassed());
      expect(v.ok).toBe(false);
      expect(failedRows(v)).toEqual(["job runner"]);
    });
  }

  it("fails when a required job is missing from needs entirely", () => {
    const needs = allSuccess();
    delete needs.verify;
    expect(failedRows(evaluateGate(needs, allPassed()))).toEqual(["job verify"]);
  });

  it("fails on no needs context at all (every job counted as not reported)", () => {
    const v = evaluateGate(null, allPassed());
    expect(v.ok).toBe(false);
    expect(failedRows(v)).toHaveLength(REQUIRED_JOBS.length);
  });

  it("fails when a runner uploaded no summary", () => {
    const s = allPassed();
    delete s.hospital;
    expect(failedRows(evaluateGate(allSuccess(), s))).toEqual(["runner hospital"]);
  });

  for (const status of ["failed", "blocked", "unsafe", "empty"]) {
    it(`fails a runner whose summary is ${status}`, () => {
      const s = allPassed();
      s.integrity = { ...s.integrity, status, passed: false, problems: ["x"] };
      expect(failedRows(evaluateGate(allSuccess(), s))).toEqual(["runner integrity"]);
    });
  }

  it("fails a runner that says passed with zero tests", () => {
    const s = allPassed();
    s.patient = passedSummary("patient", 0);
    expect(failedRows(evaluateGate(allSuccess(), s))).toEqual(["runner patient"]);
  });

  it("fails a summary whose status and passed flag disagree", () => {
    const s = allPassed();
    s.admin = { ...s.admin, passed: false };
    expect(failedRows(evaluateGate(allSuccess(), s))).toEqual(["runner admin"]);
  });

  it("fails a summary filed under the wrong runner", () => {
    const s = allPassed();
    s.session = passedSummary("therapist");
    expect(failedRows(evaluateGate(allSuccess(), s))).toEqual(["runner session"]);
  });

  it("cannot pass with nothing required", () => {
    expect(evaluateGate({}, {}, { requiredJobs: [], requiredRunners: [] }).ok).toBe(false);
  });

  it("renders a table that names each failure", () => {
    const needs = allSuccess();
    needs.verify = { result: "cancelled" };
    const md = renderGateMarkdown(evaluateGate(needs, allPassed()));
    expect(md).toContain("Quality gate: FAILED");
    expect(md).toContain("job verify | **FAILED**: cancelled");
  });
});
