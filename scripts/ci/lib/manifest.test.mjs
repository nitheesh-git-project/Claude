import { describe, expect, it } from "vitest";
import {
  RUNNERS,
  flowsCoveredBySpec,
  projectForSpecFile,
  selectSpecs,
  snapshotBaseline,
  validateManifest,
} from "./manifest.mjs";

// A minimal manifest in which every rule is satisfied, built fresh per test so
// a case can break exactly one thing.
function good() {
  const specs = {};
  const flows = [];
  RUNNERS.forEach((runner, index) => {
    const file = `${runner}-${index}.spec.ts`;
    specs[file] = {
      runner,
      levels: ["api"],
      projects: ["desktop"],
      integration: "local",
      destructive: false,
    };
    flows.push({
      id: `${runner}.flow`,
      runner,
      title: `${runner} flow`,
      required: true,
      status: "covered",
      coverage: [{ spec: file, tests: ["T-001"], level: "api" }],
    });
  });
  specs["mobile-x.spec.ts"] = {
    runner: "patient",
    levels: ["browser"],
    projects: ["mobile"],
    integration: "local",
    destructive: false,
  };
  flows.push({
    id: "patient.mobile",
    runner: "patient",
    title: "mobile",
    required: true,
    status: "covered",
    coverage: [{ spec: "mobile-x.spec.ts", tests: ["T-001"], level: "browser" }],
  });
  const manifest = { specs, flows, removed: [] };
  const files = Object.keys(specs);
  const sources = Object.fromEntries(files.map((f) => [f, 'test("T-001: something")']));
  return { manifest, files, sources };
}

const run = (m, files, baseline = null, options = {}) => validateManifest(m, files, baseline, options);
const messages = (result) => result.errors.join("\n");

describe("validateManifest", () => {
  it("accepts a manifest that satisfies every rule", () => {
    const { manifest, files, sources } = good();
    const result = run(manifest, files, snapshotBaseline(manifest), { specSources: sources });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails when a manifest spec does not exist on disk", () => {
    const { manifest, files } = good();
    const result = run(manifest, files.filter((f) => f !== "admin-3.spec.ts"));
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/names "admin-3.spec.ts", which does not exist/);
  });

  it("fails when a spec on disk has no owner", () => {
    const { manifest, files } = good();
    const result = run(manifest, [...files, "orphan.spec.ts"]);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/"orphan.spec.ts" exists in e2e\/ but no runner owns it/);
  });

  it("fails on a required flow that is a gap", () => {
    const { manifest, files } = good();
    Object.assign(manifest.flows[0], { status: "gap", coverage: [], limitation: "not built" });
    const result = run(manifest, files);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/required flow "patient.flow" is gap/);
  });

  it("fails on a required flow that is blocked", () => {
    const { manifest, files } = good();
    Object.assign(manifest.flows[0], { status: "blocked", coverage: [], limitation: "no provider" });
    expect(messages(run(manifest, files))).toMatch(/required flow "patient.flow" is blocked/);
  });

  it("accepts a non-required gap, but only with its limitation stated", () => {
    const { manifest, files } = good();
    manifest.flows.push({
      id: "x.gap",
      runner: "admin",
      title: "x",
      required: false,
      status: "gap",
      coverage: [],
      limitation: "no spec drives it",
    });
    expect(run(manifest, files).ok).toBe(true);
    delete manifest.flows.at(-1).limitation;
    expect(messages(run(manifest, files))).toMatch(/"x.gap" is gap: state the limitation/);
  });

  it("fails when a runner would select zero specs", () => {
    const { manifest, files } = good();
    // Move every hospital spec to the platform runner; the hospital flow still cites it.
    for (const entry of Object.values(manifest.specs)) if (entry.runner === "hospital") entry.runner = "platform";
    const result = run(manifest, files);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/runner "hospital" selects zero specs/);
  });

  it("fails when a flow cites a test that no longer exists in the spec", () => {
    const { manifest, files, sources } = good();
    sources["patient-0.spec.ts"] = 'test("T-999: renamed")';
    const result = run(manifest, files, null, { specSources: sources });
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/cites "T-001" in patient-0.spec.ts, which no longer appears there/);
  });

  it("fails when a flow cites a spec that is not in the manifest", () => {
    const { manifest, files } = good();
    manifest.flows[0].coverage[0].spec = "nope.spec.ts";
    expect(messages(run(manifest, files))).toMatch(/cites spec "nope.spec.ts"/);
  });

  it("fails when a flow claims a level its spec does not have", () => {
    const { manifest, files } = good();
    manifest.flows[0].coverage[0].level = "browser";
    expect(messages(run(manifest, files))).toMatch(/claims browser-level coverage/);
  });

  it("fails when an owned spec is cited by no flow", () => {
    const { manifest, files } = good();
    manifest.specs["lonely.spec.ts"] = { ...manifest.specs["admin-3.spec.ts"] };
    const result = run(manifest, [...files, "lonely.spec.ts"]);
    expect(messages(result)).toMatch(/"lonely.spec.ts" is owned but no flow cites it/);
  });

  it("fails when a mobile spec is routed to the desktop project (or the reverse)", () => {
    const { manifest, files } = good();
    manifest.specs["mobile-x.spec.ts"].projects = ["desktop"];
    expect(messages(run(manifest, files))).toMatch(/runs it in the "mobile" project only/);
    manifest.specs["mobile-x.spec.ts"].projects = ["mobile"];
    manifest.specs["admin-3.spec.ts"].projects = ["mobile"];
    expect(messages(run(manifest, files))).toMatch(/runs it in the "desktop" project only/);
  });

  it("fails on duplicate flow ids and unknown statuses", () => {
    const { manifest, files } = good();
    manifest.flows.push({ ...manifest.flows[0] });
    expect(messages(run(manifest, files))).toMatch(/declared twice/);
    manifest.flows.pop();
    manifest.flows[0].status = "mostly";
    expect(messages(run(manifest, files))).toMatch(/status must be one of/);
  });

  it("fails when a covered flow cites neither a spec nor a script", () => {
    const { manifest, files } = good();
    manifest.flows[0].coverage = [];
    expect(messages(run(manifest, files))).toMatch(/cites no spec and no script/);
    manifest.flows[0].scripts = ["scripts/x.sql"];
    expect(run(manifest, files, null).errors.join()).not.toMatch(/cites no spec/);
  });

  it("checks that rules and scripts paths exist when asked to", () => {
    const { manifest, files } = good();
    manifest.flows[0].rules = ["docs/rules/ghost.md"];
    manifest.flows[0].scripts = ["scripts/ghost.sql"];
    const result = run(manifest, files, null, { ruleExists: () => false });
    expect(messages(result)).toMatch(/rules file "docs\/rules\/ghost.md"/);
    expect(messages(result)).toMatch(/script "scripts\/ghost.sql"/);
  });
});

describe("baseline", () => {
  it("fails when a baseline spec is gone with no removed entry", () => {
    const { manifest, files } = good();
    const baseline = { specs: [...Object.keys(manifest.specs), "deleted.spec.ts"], flows: [] };
    const result = run(manifest, files, baseline);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/baseline spec "deleted.spec.ts" is gone/);
  });

  it("accepts a removed spec once a reason and a reviewer are recorded", () => {
    const { manifest, files } = good();
    manifest.removed = [{ spec: "deleted.spec.ts", reason: "feature removed in #123", reviewed: "owner 2026-10-01" }];
    const baseline = { specs: [...Object.keys(manifest.specs), "deleted.spec.ts"], flows: [] };
    expect(run(manifest, files, baseline).ok).toBe(true);
  });

  it("rejects a removed entry with no reason", () => {
    const { manifest, files } = good();
    manifest.removed = [{ spec: "deleted.spec.ts", reason: "", reviewed: "x" }];
    expect(messages(run(manifest, files))).toMatch(/has no reason/);
  });

  it("fails when a flow that was covered has disappeared or degraded", () => {
    const { manifest, files } = good();
    const baseline = snapshotBaseline(manifest);
    baseline.flows.push("vanished.flow");
    expect(messages(run(manifest, files, baseline))).toMatch(/baseline flow "vanished.flow" is gone/);

    const degraded = good();
    const base2 = snapshotBaseline(degraded.manifest);
    Object.assign(degraded.manifest.flows[0], { required: false, status: "gap", coverage: [], limitation: "x" });
    // Dropping the only citation leaves its spec orphaned too; both are reported.
    expect(messages(run(degraded.manifest, degraded.files, base2))).toMatch(
      /baseline flow "patient.flow" was covered and is now gap/
    );
  });

  it("snapshots owned specs and exercised flow ids only", () => {
    const { manifest } = good();
    manifest.flows.push({ id: "z.gap", runner: "admin", title: "z", required: false, status: "gap", coverage: [], limitation: "x" });
    const snap = snapshotBaseline(manifest);
    expect(snap.flows).not.toContain("z.gap");
    expect(snap.specs).toEqual([...snap.specs].sort());
  });
});

describe("selection", () => {
  it("routes specs by runner and project", () => {
    const { manifest } = good();
    expect(selectSpecs(manifest, "patient", "desktop").map((s) => s.file)).toEqual(["patient-0.spec.ts"]);
    expect(selectSpecs(manifest, "patient", "mobile").map((s) => s.file)).toEqual(["mobile-x.spec.ts"]);
    expect(selectSpecs(manifest, "admin", "mobile")).toEqual([]);
    expect(selectSpecs(manifest, "nonexistent", "desktop")).toEqual([]);
  });

  it("carries integration and destructive flags through", () => {
    const { manifest } = good();
    manifest.specs["integrity-6.spec.ts"].destructive = true;
    manifest.specs["integrity-6.spec.ts"].integration = "provider-sandbox";
    expect(selectSpecs(manifest, "integrity", "desktop")).toEqual([
      { file: "integrity-6.spec.ts", integration: "provider-sandbox", destructive: true },
    ]);
  });

  it("knows which project playwright.config.ts gives a file", () => {
    expect(projectForSpecFile("mobile-smoke.spec.ts")).toBe("mobile");
    expect(projectForSpecFile("admin-mobile.spec.ts")).toBe("desktop");
  });

  it("maps a spec back to the flows it protects", () => {
    const { manifest } = good();
    expect(flowsCoveredBySpec(manifest, "patient-0.spec.ts")).toEqual(["patient.flow"]);
    expect(flowsCoveredBySpec(manifest, "ghost.spec.ts")).toEqual([]);
  });
});
