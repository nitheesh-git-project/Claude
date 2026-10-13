import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNNERS } from "./manifest.mjs";
import { planRunner } from "./runner.mjs";
import {
  assignShards,
  buildMatrix,
  estimateShardSeconds,
  expectedShards,
  parseShardArg,
  runnerSpecs,
  shardLabel,
  validateShardConfig,
} from "./shards.mjs";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const realManifest = read("../../../e2e/coverage-manifest.json");
const realConfig = read("../runner-shards.json");
const e2eDir = new URL("../../../e2e/", import.meta.url);
const realSources = Object.fromEntries(
  readdirSync(e2eDir)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => [f, readFileSync(new URL(f, e2eDir), "utf8")])
);

const spec = (file, extra = {}) => ({ runner: "admin", levels: ["api"], projects: ["desktop"], integration: "local", destructive: false, ...extra });
function manifest() {
  const specs = {};
  for (const runner of RUNNERS) specs[`${runner}-own.spec.ts`] = spec(`${runner}-own`, { runner });
  Object.assign(specs, {
    "a.spec.ts": spec("a"),
    "b.spec.ts": spec("b"),
    "c.spec.ts": spec("c"),
    "big.spec.ts": spec("big"),
    "split.spec.ts": spec("split"),
    "z-drop.spec.ts": spec("z", { destructive: true }),
    "mobile-a.spec.ts": spec("m", { projects: ["mobile"] }),
  });
  return {
    specs,
    flows: [{ id: "integrity.sql", runner: "integrity", status: "covered", scripts: ["scripts/x-sql-checks.sql"] }],
  };
}
const config = (shards = {}, extra = {}) => ({
  maxRunnerJobs: 30,
  shards: { ...Object.fromEntries(RUNNERS.map((r) => [r, 1])), ...shards },
  splitFiles: { files: ["split.spec.ts"] },
  seconds: { defaultSeconds: 10, bySpec: { "big.spec.ts": 100, "split.spec.ts": 90, "admin-own.spec.ts": 5 } },
  ...extra,
});
const parallelSource = 'test.describe.configure({ mode: "parallel" });';
const sources = () => Object.fromEntries(Object.keys(manifest().specs).map((f) => [f, f === "split.spec.ts" ? parallelSource : ""]));

describe("parseShardArg / shardLabel", () => {
  it("parses i/n and refuses anything out of range", () => {
    expect(parseShardArg("2/8")).toEqual({ index: 2, total: 8 });
    expect(parseShardArg("1/1")).toEqual({ index: 1, total: 1 });
    for (const bad of ["0/3", "4/3", "1/0", "a/b", "", null, undefined, "2", "-1/3"]) expect(parseShardArg(bad)).toBeNull();
  });

  it("names a shard runner-iofn, and an unsplit runner by its own name", () => {
    expect(shardLabel("admin", 2, 8)).toBe("admin-2of8");
    expect(shardLabel("hospital", 1, 1)).toBe("hospital");
    expect(shardLabel("hospital")).toBe("hospital");
  });
});

describe("buildMatrix / expectedShards", () => {
  it("emits one entry per runner × shard, in runner order", () => {
    const m = buildMatrix(config({ admin: 3 }));
    expect(m.include).toHaveLength(RUNNERS.length + 2);
    expect(m.include.filter((e) => e.runner === "admin")).toEqual([
      { runner: "admin", shard: 1, total: 3, label: "admin-1of3" },
      { runner: "admin", shard: 2, total: 3, label: "admin-2of3" },
      { runner: "admin", shard: 3, total: 3, label: "admin-3of3" },
    ]);
    expect(m.include.find((e) => e.runner === "hospital")).toEqual({ runner: "hospital", shard: 1, total: 1, label: "hospital" });
  });

  it("puts the longest shards first when given the manifest, keeping every shard", () => {
    const m = buildMatrix(realConfig, realManifest).include;
    expect(m.map((e) => e.label).sort()).toEqual(expectedShards(realConfig).map((e) => e.label).sort());
    const est = new Map(estimateShardSeconds(realManifest, realConfig).map((e) => [e.label, e.seconds]));
    for (let i = 1; i < m.length; i += 1) expect(est.get(m[i - 1].label)).toBeGreaterThanOrEqual(est.get(m[i].label));
  });

  it("treats a missing or nonsense count as one shard, never zero", () => {
    expect(expectedShards({ shards: { admin: 0, patient: "3" } }).filter((e) => ["admin", "patient"].includes(e.runner))).toHaveLength(2);
    expect(expectedShards(null)).toHaveLength(RUNNERS.length);
  });
});

describe("assignShards", () => {
  const specs = () => runnerSpecs(manifest(), "admin");

  it("gives every whole file to exactly one shard and a split file to all of them", () => {
    const out = assignShards(specs(), 3, config());
    const whole = out.flat().filter((s) => !s.split).map((s) => s.file).sort();
    expect(whole).toEqual(specs().map((s) => s.file).filter((f) => f !== "split.spec.ts").sort());
    for (const shard of out) expect(shard.filter((s) => s.split).map((s) => s.file)).toEqual(["split.spec.ts"]);
  });

  it("does not split a file when the runner has one shard", () => {
    const [only] = assignShards(specs(), 1, config());
    expect(only.find((s) => s.file === "split.spec.ts").split).toBe(false);
    expect(only).toHaveLength(specs().length);
  });

  it("puts the longest file alone when it outweighs the rest", () => {
    const out = assignShards(specs(), 2, config());
    const withBig = out.find((s) => s.some((x) => x.file === "big.spec.ts"));
    expect(withBig.filter((x) => !x.split).map((x) => x.file)).toEqual(["big.spec.ts"]);
  });

  it("is deterministic whatever order the specs arrive in", () => {
    const a = assignShards(specs(), 3, config());
    const b = assignShards([...specs()].reverse(), 3, config());
    expect(b).toEqual(a);
  });

  it("carries the project and the destructive flag through", () => {
    const flat = assignShards(specs(), 2, config()).flat();
    expect(flat.find((s) => s.file === "z-drop.spec.ts")).toMatchObject({ destructive: true, project: "desktop" });
    expect(flat.find((s) => s.file === "mobile-a.spec.ts")).toMatchObject({ project: "mobile" });
  });
});

describe("planRunner with a shard", () => {
  it("plans only its own files, passes --shard for a split file, and keeps destructive specs separate", () => {
    const m = manifest();
    const c = config({ admin: 2 });
    const plans = [1, 2].map((index) => planRunner(m, "admin", { index, total: 2, config: c }));
    expect(plans.map((p) => p.label)).toEqual(["admin-1of2", "admin-2of2"]);
    expect(plans[0].playwrightShard).toEqual({ "split.spec.ts": "1/2" });
    expect(plans[1].playwrightShard).toEqual({ "split.spec.ts": "2/2" });
    const all = plans.flatMap((p) => p.specs.filter((f) => f !== "split.spec.ts"));
    expect(all.sort()).toEqual(Object.keys(m.specs).filter((f) => m.specs[f].runner === "admin" && f !== "split.spec.ts").sort());
    for (const p of plans) {
      for (const proj of p.projects) expect(proj.files).not.toContain("z-drop.spec.ts");
    }
    expect(plans.flatMap((p) => p.projects.flatMap((x) => x.destructive))).toEqual(["z-drop.spec.ts"]);
  });

  it("runs the integrity scripts on shard 1 only", () => {
    const m = manifest();
    const c = config({ integrity: 2 });
    expect(planRunner(m, "integrity", { index: 1, total: 2, config: c }).scriptsBeforeSpecs).toEqual(["scripts/x-sql-checks.sql"]);
    expect(planRunner(m, "integrity", { index: 2, total: 2, config: c }).scriptsBeforeSpecs).toEqual([]);
  });

  it("without a shard, plans the whole runner exactly as before", () => {
    const p = planRunner(manifest(), "admin");
    expect(p.label).toBe("admin");
    expect(p.shard).toEqual({ index: 1, total: 1 });
    expect(p.playwrightShard).toEqual({});
    expect(p.total).toBe(Object.values(manifest().specs).filter((s) => s.runner === "admin").length);
  });
});

describe("validateShardConfig", () => {
  const errors = (c, m = manifest(), s = sources()) => validateShardConfig(c, m, s).errors.join("\n");

  it("accepts a sound config", () => {
    expect(validateShardConfig(config({ admin: 3 }), manifest(), sources())).toEqual({ ok: true, errors: [] });
  });

  it("requires a count for every runner and refuses unknown runners", () => {
    const c = config();
    delete c.shards.money;
    c.shards.billing = 2;
    expect(errors(c)).toMatch(/runner "money" needs a shard count/);
    expect(errors(c)).toMatch(/names "billing", which is not a runner/);
  });

  it("refuses to split a runner that owns integrity scripts", () => {
    expect(errors(config({ integrity: 2, admin: 1 }))).toMatch(/"integrity" owns integrity scripts/);
  });

  it("refuses more jobs than maxRunnerJobs", () => {
    expect(errors(config({ admin: 6 }, { maxRunnerJobs: 10 }))).toMatch(/runner jobs is over maxRunnerJobs \(10\)/);
  });

  it("refuses a split file that is not in parallel mode, or not owned", () => {
    const s = sources();
    s["split.spec.ts"] = 'test.describe.serial("x", () => {})';
    expect(errors(config(), manifest(), s)).toMatch(/"split.spec.ts" is in splitFiles but does not declare/);
    expect(errors(config({}, { splitFiles: { files: ["ghost.spec.ts"] } }))).toMatch(/names "ghost.spec.ts", which the manifest does not own/);
  });

  it("refuses a shard count that would leave a shard with nothing to run", () => {
    expect(errors(config({ hospital: 2 }))).toMatch(/shard hospital-2of2 would run no spec/);
  });
});

describe("the real config", () => {
  it("is valid against the real manifest and specs", () => {
    expect(validateShardConfig(realConfig, realManifest, realSources)).toEqual({ ok: true, errors: [] });
  });

  it("splits layout-audit across every admin shard", () => {
    const total = realConfig.shards.admin;
    expect(total).toBeGreaterThan(1);
    for (let index = 1; index <= total; index += 1) {
      expect(planRunner(realManifest, "admin", { index, total, config: realConfig }).playwrightShard["layout-audit.spec.ts"]).toBe(`${index}/${total}`);
    }
  });

  it("gives every runner's shards, together, exactly the runner's specs", () => {
    for (const runner of RUNNERS) {
      const total = realConfig.shards[runner];
      const given = new Set();
      for (let index = 1; index <= total; index += 1) {
        for (const f of planRunner(realManifest, runner, { index, total, config: realConfig }).specs) given.add(f);
      }
      const owned = Object.keys(realManifest.specs).filter((f) => realManifest.specs[f].runner === runner);
      expect([...given].sort(), runner).toEqual(owned.sort());
    }
  });

  it("estimates every shard under five minutes of spec time", () => {
    for (const e of estimateShardSeconds(realManifest, realConfig)) expect(e.seconds, e.label).toBeLessThan(300);
  });
});
