import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNNERS } from "./manifest.mjs";
import { REQUIRED_JOBS, evaluateGate, renderGateMarkdown } from "./gate.mjs";
import { planRunner } from "./runner.mjs";
import { expectedShards } from "./shards.mjs";

const planRunnerSpecsForTest = (manifest, s, config) =>
  planRunner(manifest, s.runner, { index: s.shard, total: s.total, config }).specs;

// admin split in three, everything else whole: enough to exercise both.
const shardConfig = { shards: { ...Object.fromEntries(RUNNERS.map((r) => [r, 1])), admin: 3 } };
const shards = expectedShards(shardConfig);

const allSuccess = () => Object.fromEntries(REQUIRED_JOBS.map((j) => [j, { result: "success" }]));
const passedSummary = ({ runner, shard, total, label }, count = 5, specs = [`${label}.spec.ts`]) => ({
  runner,
  label,
  shard: { index: shard, total },
  specs,
  status: "passed",
  passed: true,
  counts: { total: count },
});
const allPassed = () => Object.fromEntries(shards.map((s) => [s.label, passedSummary(s)]));
const evaluate = (needs, summaries, extra = {}) => evaluateGate(needs, summaries, { shardConfig, ...extra });
const failedRows = (v) => v.rows.filter((r) => !r.ok).map((r) => r.name);

describe("evaluateGate", () => {
  it("passes only when every job succeeded and every shard passed with tests", () => {
    const v = evaluate(allSuccess(), allPassed());
    expect(v.ok).toBe(true);
    expect(v.rows).toHaveLength(REQUIRED_JOBS.length + RUNNERS.length + 2);
    expect(v.rows.map((r) => r.name)).toContain("runner admin-2of3");
    expect(v.rows.map((r) => r.name)).toContain("runner hospital");
  });

  it("requires the plan job", () => {
    expect(REQUIRED_JOBS).toContain("plan");
    const needs = allSuccess();
    delete needs.plan;
    expect(failedRows(evaluate(needs, allPassed()))).toEqual(["job plan"]);
  });

  for (const result of ["failure", "skipped", "cancelled", "timed_out", "", null]) {
    it(`treats a required job that is "${result}" as a failure`, () => {
      const needs = allSuccess();
      needs.runner = { result };
      const v = evaluate(needs, allPassed());
      expect(v.ok).toBe(false);
      expect(failedRows(v)).toEqual(["job runner"]);
    });
  }

  it("fails when a required job is missing from needs entirely", () => {
    const needs = allSuccess();
    delete needs.verify;
    expect(failedRows(evaluate(needs, allPassed()))).toEqual(["job verify"]);
  });

  it("fails on no needs context at all (every job counted as not reported)", () => {
    const v = evaluate(null, allPassed());
    expect(v.ok).toBe(false);
    expect(failedRows(v)).toHaveLength(REQUIRED_JOBS.length);
  });

  it("fails when an unsplit runner uploaded no summary", () => {
    const s = allPassed();
    delete s.hospital;
    expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner hospital"]);
  });

  it("fails when one shard of a split runner uploaded no summary, though the others passed", () => {
    const s = allPassed();
    delete s["admin-2of3"];
    expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner admin-2of3"]);
  });

  it("does not accept an unsplit summary in place of a shard's", () => {
    const s = allPassed();
    delete s["admin-1of3"];
    s.admin = passedSummary({ runner: "admin", shard: 1, total: 1, label: "admin" });
    expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner admin-1of3"]);
  });

  it("fails a summary filed under a shard it was not run as", () => {
    const s = allPassed();
    s["admin-3of3"] = { ...s["admin-3of3"], shard: { index: 2, total: 3 } };
    const v = evaluate(allSuccess(), s);
    expect(failedRows(v)).toEqual(["runner admin-3of3"]);
    expect(v.rows.find((r) => r.name === "runner admin-3of3").detail).toMatch(/shard 2\/3, expected 3\/3/);
  });

  it("fails a shard run with a different shard count than the config", () => {
    const s = allPassed();
    s["admin-1of3"] = { ...s["admin-1of3"], shard: { index: 1, total: 2 } };
    expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner admin-1of3"]);
  });

  for (const status of ["failed", "blocked", "unsafe", "empty"]) {
    it(`fails a shard whose summary is ${status}`, () => {
      const s = allPassed();
      s["admin-2of3"] = { ...s["admin-2of3"], status, passed: false, problems: ["x"] };
      s.integrity = { ...s.integrity, status, passed: false, problems: ["x"] };
      expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner admin-2of3", "runner integrity"]);
    });
  }

  it("fails a shard that says passed with zero tests", () => {
    const s = allPassed();
    s["admin-3of3"] = passedSummary(shards.find((x) => x.label === "admin-3of3"), 0);
    expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner admin-3of3"]);
  });

  it("fails a summary whose status and passed flag disagree", () => {
    const s = allPassed();
    s.patient = { ...s.patient, passed: false };
    expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner patient"]);
  });

  it("fails a summary filed under the wrong runner", () => {
    const s = allPassed();
    s.session = { ...passedSummary(shards.find((x) => x.label === "session")), runner: "therapist" };
    expect(failedRows(evaluate(allSuccess(), s))).toEqual(["runner session"]);
  });

  it("fails closed with no shard config: one unsplit summary per runner is still required", () => {
    const v = evaluateGate(allSuccess(), allPassed(), { shardConfig: null });
    expect(failedRows(v)).toEqual(["runner admin"]);
  });

  it("cannot pass with nothing required", () => {
    expect(evaluateGate({}, {}, { requiredJobs: [], requiredShards: [] }).ok).toBe(false);
  });

  describe("with the manifest: every owned spec given to some shard", () => {
    const manifest = {
      specs: Object.fromEntries([
        ...shards.map((s) => [`${s.label}.spec.ts`, { runner: s.runner }]),
        ["admin-extra.spec.ts", { runner: "admin" }],
      ]),
    };

    it("fails a runner when a spec it owns was given to no shard", () => {
      const v = evaluate(allSuccess(), allPassed(), { manifest });
      expect(failedRows(v)).toEqual(["specs admin"]);
      expect(v.rows.find((r) => r.name === "specs admin").detail).toMatch(/admin-extra\.spec\.ts/);
    });

    it("passes once some shard was given it", () => {
      const s = allPassed();
      s["admin-2of3"].specs = ["admin-2of3.spec.ts", "admin-extra.spec.ts"];
      const v = evaluate(allSuccess(), s, { manifest });
      expect(v.ok).toBe(true);
    });

    it("the real plan gives every real spec to exactly the shards that own it", () => {
      const real = JSON.parse(readFileSync(new URL("../../../e2e/coverage-manifest.json", import.meta.url), "utf8"));
      const config = JSON.parse(readFileSync(new URL("../runner-shards.json", import.meta.url), "utf8"));
      const summaries = Object.fromEntries(
        expectedShards(config).map((s) => [s.label, passedSummary(s, 5, planRunnerSpecsForTest(real, s, config))])
      );
      const v = evaluateGate(allSuccess(), summaries, { shardConfig: config, manifest: real });
      expect(failedRows(v)).toEqual([]);
    });
  });

  it("renders a table that names each failure", () => {
    const needs = allSuccess();
    needs.verify = { result: "cancelled" };
    const md = renderGateMarkdown(evaluate(needs, allPassed()));
    expect(md).toContain("Quality gate: FAILED");
    expect(md).toContain("job verify | **FAILED**: cancelled");
  });
});
