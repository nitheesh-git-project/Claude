// Which Playwright specs a change could have broken, from the files it
// touched. Pure, so it can be tested without git or a browser.
//
// This is the local half of the quality gate. CI runs every spec on seven
// runners, which is the right proof before a merge and the wrong place to
// first learn a selector went stale: each red runner there is a push, a
// wait and a log to read. Running the few specs a change can reach before
// the push catches most of it for free.
//
// The mapping is by name, not by import graph: a spec reaches the app over
// HTTP, so what links it to a file is the URL it visits, the API it calls,
// or a src/lib module it imports for its fixtures. Over-selecting costs a
// few minutes; under-selecting costs a CI round, so ties go to running it.

/** Specs that guard a whole-app rule a change rarely names but often breaks:
 *  admin-multi-admin carries H-006 (every table the admin page reads is in
 *  realtime), layout-audit carries the overlap/clipping audit. */
export const ALWAYS_RUN = ["admin-multi-admin.spec.ts", "layout-audit.spec.ts"];

/** Files every spec depends on: touching one means the whole suite. */
const WHOLE_SUITE = [/^e2e\/helpers\.ts$/, /^e2e\/global-setup\.ts$/, /^playwright\.config\.ts$/, /^e2e\/layout\//];

/** Basenames too generic to mean anything when found in a spec's text. */
const GENERIC = new Set(["page", "layout", "route", "index", "types", "utils", "constants", "client", "server", "admin"]);

/** The URL a file under src/app serves, or null. Route groups `(x)` add no
 *  segment; a dynamic segment ends the path, since specs visit it with a
 *  real id the prefix still matches. */
export function urlForAppFile(path) {
  const m = /^src\/app\/(.*)\/(page|layout|route)\.tsx?$/.exec(path);
  if (!m) return null;
  const parts = [];
  for (const seg of m[1].split("/")) {
    if (seg.startsWith("(") && seg.endsWith(")")) continue;
    if (seg.startsWith("[")) break;
    parts.push(seg);
  }
  return parts.length ? `/${parts.join("/")}` : null;
}

/** What to look for in a spec's source to decide it covers `path`. */
export function tokensForFile(path) {
  const url = urlForAppFile(path);
  if (url) return [url];
  const lib = /^src\/(?:lib|components)\/(?:.*\/)?([A-Za-z0-9_-]+)\.(?:ts|tsx|mjs)$/.exec(path);
  if (lib && !lib[1].endsWith(".test") && !GENERIC.has(lib[1])) return [lib[1]];
  return [];
}

/**
 * @param {string[]} changed  repo-relative paths changed since the base
 * @param {Record<string, string>} specSources  spec file name -> its source
 * @returns {{ wholeSuite: boolean, specs: string[], reasons: Record<string, string[]>, schemaChanged: boolean }}
 */
export function selectSpecs(changed, specSources) {
  const names = Object.keys(specSources);
  const reasons = {};
  const add = (spec, why) => {
    if (!specSources[spec]) return;
    const list = (reasons[spec] ??= []);
    if (!list.includes(why)) list.push(why);
  };

  const wholeSuite = changed.some((f) => WHOLE_SUITE.some((re) => re.test(f)));
  const schemaChanged = changed.includes("supabase/schema.sql");

  for (const file of changed) {
    const spec = /^e2e\/([^/]+\.spec\.ts)$/.exec(file);
    if (spec) {
      add(spec[1], "spec changed");
      continue;
    }
    for (const token of tokensForFile(file)) {
      const isUrl = token.startsWith("/");
      for (const name of names) {
        const src = specSources[name];
        const hit = isUrl
          ? src.includes(`${token}"`) || src.includes(`${token}?`) || src.includes(`${token}/`) || src.includes(`${token}\``)
          : new RegExp(`\\b${token}\\b`).test(src);
        if (hit) add(name, file);
      }
    }
  }
  for (const spec of ALWAYS_RUN) add(spec, "always");

  return {
    wholeSuite,
    schemaChanged,
    specs: wholeSuite ? names.slice().sort() : Object.keys(reasons).sort(),
    reasons,
  };
}
