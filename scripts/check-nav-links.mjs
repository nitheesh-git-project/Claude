#!/usr/bin/env node
// Fails when an internal link in src/ points at a route that does not exist,
// or at an admin screen by a hand-written query string.
//
// Why this exists: a renamed route leaves its old links behind, and nothing
// complains. Next has no compile-time check on a string href, so a dead link
// is only found by someone clicking it -- and these particular links sit on
// dashboards, which nobody browses for fun. Three had already rotted this
// way by the time it was written: the therapist's own *primary* action
// pointed at /therapist/dashboard#availability (an anchor left over from
// when Availability was a section of that page rather than a route), the
// therapist feed sent an answered recommendation to /therapist/dashboard/
// patients (a route that has never existed), and the admin quick actions
// built ?section=&tab= by hand.
//
// The admin rule is separate because a stale admin link does not 404 -- it
// looks like it works. findTab() falls back to the section's first screen
// when the tab key is unknown, so a hand-written query string keeps
// rendering something after the tab it names is gone. adminScreenHref() is
// typed against adminNav.ts, so the same mistake becomes a type error.
//
// Run as part of `npm run lint`, beside check-realtime-coverage.mjs.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = "src";
const APP = join(SRC, "app");

function walk(dir, test) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, test));
    else if (test(path)) out.push(path);
  }
  return out;
}

// ---------------------------------------------------------------------
// The route set, read off the filesystem rather than a hand-kept list --
// the point of the check is that a list can drift.
// ---------------------------------------------------------------------
// route.ts counts as well as page.tsx: plenty of these links are fetch
// targets and download hrefs, and an API route renamed out from under one
// is the same silent break as a page renamed out from under a link.
const routes = new Set();
for (const file of walk(APP, (p) => p.endsWith(`${sep}page.tsx`) || p.endsWith(`${sep}route.ts`))) {
  const segments = relative(APP, file).split(sep).slice(0, -1);
  const path = segments
    // Route groups (folder) and parallel-route slots (@modal) contribute
    // nothing to the URL; intercepting markers ((.)foo) resolve to the
    // route they intercept, which the real page.tsx already registers.
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"))
    .filter((s) => !s.startsWith("(."))
    .join("/");
  routes.add(`/${path}`.replace(/\/+$/, "") || "/");
}

// A dynamic segment matches anything a caller interpolates into it.
const routePatterns = [...routes].map((route) => ({
  route,
  regex: new RegExp(
    `^${route
      .split("/")
      .map((s) => (s.startsWith("[") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/")}$`
  ),
}));

function routeExists(path) {
  return routePatterns.some((r) => r.regex.test(path));
}

// ---------------------------------------------------------------------
// Every internal link literal. Template literals are kept when their only
// interpolation is a whole path segment (`/x/${id}`), which the dynamic
// matcher above handles; anything else is skipped rather than guessed at.
// ---------------------------------------------------------------------
const HREF = /(?:href|redirect|push|replace)\s*[=:(]\s*[`"']((\/[^`"'\n]*))[`"']/g;

const dead = [];
const handBuiltAdmin = [];
const dashboardAnchors = [];

for (const file of walk(SRC, (p) => p.endsWith(".ts") || p.endsWith(".tsx"))) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(HREF)) {
    const raw = match[1];
    const line = source.slice(0, match.index).split("\n").length;
    const where = `${file}:${line}`;

    // Any admin screen link must come from adminScreenHref, because a
    // hand-written one fails silently (see the header comment).
    if (raw.startsWith("/admin/dashboard?")) {
      handBuiltAdmin.push([raw, where]);
      continue;
    }

    const [beforeHash, hash] = raw.split("#");
    const path = beforeHash.split("?")[0].replace(/\/+$/, "") || "/";

    // The dashboards navigate by route. Their shells' scroll-spy serves
    // Edit Profile's sub-sections only, so a fragment anywhere else is a
    // leftover from before that section became a route of its own.
    if (hash !== undefined && /\/dashboard(\/|$)/.test(path) && !path.endsWith("/profile")) {
      dashboardAnchors.push([raw, where]);
      continue;
    }

    // Interpolated segments are already normalised to ${...} by the regex
    // only when the whole segment is one; a partial interpolation leaves a
    // "${" in the string, which we cannot resolve, so skip it.
    if (path.includes("${")) continue;

    if (!routeExists(path)) dead.push([raw, where]);
  }
}

let failed = false;

if (dead.length > 0) {
  failed = true;
  console.error(`\nLinks pointing at routes that do not exist:\n`);
  for (const [href, where] of dead) console.error(`  ${href}\n    ${where}`);
}

if (dashboardAnchors.length > 0) {
  failed = true;
  console.error(
    `\nDashboard links carrying a fragment. Every dashboard section is a real\n` +
      `route now, so a fragment lands on the dashboard root instead:\n`
  );
  for (const [href, where] of dashboardAnchors) console.error(`  ${href}\n    ${where}`);
}

if (handBuiltAdmin.length > 0) {
  failed = true;
  console.error(
    `\nHand-written admin screen links. Use adminScreenHref(section, tab) from\n` +
      `src/lib/adminNav.ts, which is typed against the section list -- a\n` +
      `hand-written query string that names a tab which no longer exists\n` +
      `silently falls back to that section's first screen:\n`
  );
  for (const [href, where] of handBuiltAdmin) console.error(`  ${href}\n    ${where}`);
}

if (failed) process.exit(1);

console.log(`Nav links OK — ${routes.size} route(s), every internal link resolves.`);
