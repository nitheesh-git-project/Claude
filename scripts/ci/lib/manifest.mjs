// The coverage manifest's rules, as pure functions.
//
// `e2e/coverage-manifest.json` says which runner owns each Playwright spec
// and which product flows those specs cover. This module is what makes that
// file an honest statement rather than a wish: it fails when the manifest and
// the repository disagree, in either direction.
//
// Nothing here touches the filesystem or the network, so every rule is
// unit-tested (manifest.test.mjs) and the CLI around it
// (scripts/ci/check-coverage-manifest.mjs) only loads the inputs.

/** The runners that execute Playwright specs, plus `integrity`, which also
 *  runs the SQL checks and the authorization/concurrency scripts. */
export const RUNNERS = [
  "patient",
  "therapist",
  "session",
  "admin",
  "hospital",
  "platform",
  "integrity",
];

export const PROJECTS = ["desktop", "mobile"];
export const LEVELS = ["browser", "api", "db"];
export const INTEGRATIONS = ["local", "mocked", "provider-sandbox"];
export const FLOW_STATUSES = ["covered", "partial", "gap", "blocked"];

/** Statuses that count as "this flow is exercised by something". */
const EXERCISED = new Set(["covered", "partial"]);

/** Playwright's own routing for the two projects (playwright.config.ts):
 *  `mobile` runs `mobile-*.spec.ts`, `desktop` runs everything else. The
 *  manifest must agree, or a spec silently runs in no project at all. */
export function projectForSpecFile(file) {
  return /^mobile-.*\.spec\.ts$/.test(file) ? "mobile" : "desktop";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Specs a runner executes in one Playwright project, in a stable order.
 *
 * @returns {{file: string, integration: string, destructive: boolean}[]}
 */
export function selectSpecs(manifest, runner, project) {
  const specs = manifest?.specs ?? {};
  return Object.keys(specs)
    .filter((file) => specs[file].runner === runner && (specs[file].projects ?? []).includes(project))
    .sort()
    .map((file) => ({
      file,
      integration: specs[file].integration,
      destructive: Boolean(specs[file].destructive),
    }));
}

/** Flow ids a runner owns, for the job summary. */
export function flowsForRunner(manifest, runner) {
  return (manifest?.flows ?? []).filter((flow) => flow.runner === runner);
}

/** Flow ids a given spec file covers. */
export function flowsCoveredBySpec(manifest, file) {
  return (manifest?.flows ?? [])
    .filter((flow) => (flow.coverage ?? []).some((c) => c.spec === file))
    .map((flow) => flow.id);
}

/**
 * Checks the manifest against the repository.
 *
 * @param {object} manifest   parsed e2e/coverage-manifest.json
 * @param {string[]} specFiles every `*.spec.ts` basename found in e2e/
 * @param {{specs?: string[], flows?: string[]}|null} baseline
 *        parsed e2e/coverage-baseline.json: what the manifest owned when the
 *        baseline was last taken. Anything in it that has since vanished
 *        needs a `removed` entry giving a reason.
 * @param {object} [options]
 * @param {Record<string,string>} [options.specSources]
 *        file -> source text. When given, every `tests[]` string a flow cites
 *        must appear in that spec, so a renamed or deleted test cannot keep
 *        claiming a flow.
 * @param {(path: string) => boolean} [options.ruleExists]
 *        whether a repo-relative path exists; checked for every `rules[]` and
 *        `scripts[]` entry. Skipped when omitted.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateManifest(manifest, specFiles, baseline, options = {}) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (!manifest || typeof manifest !== "object") {
    return { ok: false, errors: ["manifest is missing or not an object"] };
  }
  const specs = manifest.specs && typeof manifest.specs === "object" ? manifest.specs : null;
  const flows = Array.isArray(manifest.flows) ? manifest.flows : null;
  if (!specs) fail("manifest.specs is missing");
  if (!flows) fail("manifest.flows is missing");
  if (!specs || !flows) return { ok: false, errors };

  const removed = Array.isArray(manifest.removed) ? manifest.removed : [];
  const onDisk = new Set(specFiles);

  // ---- specs: every one owned, every owner real ---------------------------
  for (const file of specFiles) {
    if (!(file in specs)) {
      fail(`spec "${file}" exists in e2e/ but no runner owns it -- add it to manifest.specs`);
    }
  }
  for (const [file, entry] of Object.entries(specs)) {
    if (!onDisk.has(file)) {
      fail(`manifest.specs names "${file}", which does not exist in e2e/`);
      continue;
    }
    if (!RUNNERS.includes(entry?.runner)) {
      fail(`spec "${file}": runner "${entry?.runner}" is not one of ${RUNNERS.join(", ")}`);
    }
    const levels = entry?.levels;
    if (!Array.isArray(levels) || levels.length === 0 || levels.some((l) => !LEVELS.includes(l))) {
      fail(`spec "${file}": levels must be a non-empty subset of ${LEVELS.join(", ")}`);
    }
    const projects = entry?.projects;
    if (!Array.isArray(projects) || projects.length === 0 || projects.some((p) => !PROJECTS.includes(p))) {
      fail(`spec "${file}": projects must be a non-empty subset of ${PROJECTS.join(", ")}`);
    } else {
      const expected = projectForSpecFile(file);
      if (projects.length !== 1 || projects[0] !== expected) {
        fail(
          `spec "${file}": playwright.config.ts runs it in the "${expected}" project only, ` +
            `but the manifest says ${JSON.stringify(projects)}`
        );
      }
    }
    if (!INTEGRATIONS.includes(entry?.integration)) {
      fail(`spec "${file}": integration must be one of ${INTEGRATIONS.join(", ")}`);
    }
    if (typeof entry?.destructive !== "boolean") {
      fail(`spec "${file}": destructive must be true or false`);
    }
  }

  // ---- runners: none may select nothing -----------------------------------
  for (const runner of RUNNERS) {
    const selected = PROJECTS.flatMap((project) => selectSpecs(manifest, runner, project));
    if (selected.length === 0) {
      fail(`runner "${runner}" selects zero specs -- a runner with nothing to run would report green`);
    }
  }

  // ---- flows ---------------------------------------------------------------
  const seenIds = new Set();
  const specsCovered = new Set();
  for (const flow of flows) {
    const id = flow?.id;
    if (!isNonEmptyString(id)) {
      fail("a flow has no id");
      continue;
    }
    if (seenIds.has(id)) fail(`flow id "${id}" is declared twice`);
    seenIds.add(id);

    if (!RUNNERS.includes(flow.runner)) fail(`flow "${id}": runner "${flow.runner}" is not a known runner`);
    if (!isNonEmptyString(flow.title)) fail(`flow "${id}": needs a title`);
    if (!FLOW_STATUSES.includes(flow.status)) {
      fail(`flow "${id}": status must be one of ${FLOW_STATUSES.join(", ")}`);
    }
    if (typeof flow.required !== "boolean") fail(`flow "${id}": required must be true or false`);

    if (flow.required === true && (flow.status === "gap" || flow.status === "blocked")) {
      fail(
        `required flow "${id}" is ${flow.status}` +
          (isNonEmptyString(flow.limitation) ? ` (${flow.limitation})` : "") +
          " -- cover it, or mark it not required with the reason it cannot be proven yet"
      );
    }

    const coverage = Array.isArray(flow.coverage) ? flow.coverage : [];
    const scripts = Array.isArray(flow.scripts) ? flow.scripts : [];
    if (EXERCISED.has(flow.status) && coverage.length === 0 && scripts.length === 0) {
      fail(`flow "${id}" is ${flow.status} but cites no spec and no script`);
    }
    if ((flow.status === "gap" || flow.status === "blocked") && (coverage.length > 0 || scripts.length > 0)) {
      fail(`flow "${id}" is ${flow.status} yet cites specs or scripts -- say "partial" if something exercises it`);
    }
    if (
      (flow.status === "partial" || flow.status === "gap" || flow.status === "blocked") &&
      !isNonEmptyString(flow.limitation)
    ) {
      fail(`flow "${id}" is ${flow.status}: state the limitation or the blocker in "limitation"`);
    }

    for (const cite of coverage) {
      if (!cite || !(cite.spec in specs)) {
        fail(`flow "${id}" cites spec "${cite?.spec}", which is not in manifest.specs`);
        continue;
      }
      specsCovered.add(cite.spec);
      if (!LEVELS.includes(cite.level)) {
        fail(`flow "${id}" cites ${cite.spec} with level "${cite.level}"`);
      } else if (!specs[cite.spec].levels?.includes(cite.level)) {
        fail(`flow "${id}" claims ${cite.level}-level coverage from ${cite.spec}, which the manifest says is ${specs[cite.spec].levels.join("/")}`);
      }
      if (!Array.isArray(cite.tests) || cite.tests.length === 0) {
        fail(`flow "${id}" cites ${cite.spec} without naming the tests`);
      } else if (options.specSources) {
        const source = options.specSources[cite.spec];
        if (typeof source !== "string") {
          fail(`flow "${id}": no source was supplied for ${cite.spec}, so its tests cannot be checked`);
        } else {
          for (const test of cite.tests) {
            if (!source.includes(test)) {
              fail(`flow "${id}" cites "${test}" in ${cite.spec}, which no longer appears there`);
            }
          }
        }
      }
    }

    if (options.ruleExists) {
      for (const rule of Array.isArray(flow.rules) ? flow.rules : []) {
        if (!options.ruleExists(rule)) fail(`flow "${id}" cites rules file "${rule}", which does not exist`);
      }
      for (const script of scripts) {
        if (!options.ruleExists(script)) fail(`flow "${id}" cites script "${script}", which does not exist`);
      }
    }
  }

  // A spec that no flow mentions is coverage nobody can see.
  for (const file of Object.keys(specs)) {
    if (onDisk.has(file) && !specsCovered.has(file)) {
      fail(`spec "${file}" is owned but no flow cites it -- name the flow it protects`);
    }
  }

  // ---- removals need a reason ---------------------------------------------
  for (const entry of removed) {
    const subject = entry?.spec ?? entry?.flow;
    if (!isNonEmptyString(subject)) fail("a removed[] entry names neither a spec nor a flow");
    if (!isNonEmptyString(entry?.reason)) fail(`removed entry for "${subject}" has no reason`);
    if (!isNonEmptyString(entry?.reviewed)) fail(`removed entry for "${subject}" has no reviewed (who and when)`);
  }
  const removedSpecs = new Set(removed.map((r) => r?.spec).filter(Boolean));
  const removedFlows = new Set(removed.map((r) => r?.flow).filter(Boolean));

  // ---- baseline: coverage may grow, never quietly shrink -------------------
  if (baseline) {
    for (const file of baseline.specs ?? []) {
      if (!(file in specs) && !removedSpecs.has(file)) {
        fail(
          `baseline spec "${file}" is gone from the manifest with no removed[] entry -- ` +
            "deleting a spec must say why"
        );
      }
    }
    const byId = new Map(flows.map((f) => [f?.id, f]));
    for (const id of baseline.flows ?? []) {
      const flow = byId.get(id);
      if (!flow) {
        if (!removedFlows.has(id)) fail(`baseline flow "${id}" is gone with no removed[] entry`);
      } else if (!EXERCISED.has(flow.status) && !removedFlows.has(id)) {
        fail(`baseline flow "${id}" was covered and is now ${flow.status} -- coverage may not shrink silently`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** The baseline a manifest would produce today: owned specs and the ids of
 *  the flows something exercises. Used to (re)write the baseline file. */
export function snapshotBaseline(manifest) {
  return {
    specs: Object.keys(manifest.specs).sort(),
    flows: manifest.flows
      .filter((flow) => EXERCISED.has(flow.status))
      .map((flow) => flow.id)
      .sort(),
  };
}
