#!/usr/bin/env node
// Load test for the public site and the booking path's reads -- staging only.
//
//   npm run load:staging                         50 users for 60 s at staging
//   node scripts/load-test.mjs --target http://localhost:3000 --users 20 --seconds 30
//
// Each simulated user loops: open a public page, then (as a booking visitor
// does) ask for the next week's open hours. It is read-only by design -- it
// signs in as nobody, books nothing and pays nothing -- because a load test
// that writes is a data generator, and the staging report's rule for this
// test is "never against a database with real patients". The production host
// is refused outright, whatever flags are passed.
//
// Passes when every page's 95th percentile is under --p95-ms (default 2000,
// the staging review's "pages stay under 2 seconds") and nothing failed:
// no 5xx, no network error, no timeout. A 429 is the rate limiter doing its
// job against fifty users sharing one IP, so it is counted on its own line
// and never as a failure (a 429 is not a "no", and it is not an error).
//
// No dependencies: Node's own fetch, one process. Exit code 0 = pass, 1 = fail,
// 2 = refused or bad arguments.

const PRODUCTION_HOSTS = new Set(["moverestorephysio.com", "www.moverestorephysio.com"]);
const ALLOWED_HOSTS = new Set(["staging.moverestorephysio.com", "localhost", "127.0.0.1"]);

const PAGES = ["/", "/conditions", "/how-it-works", "/team", "/mission", "/faq", "/book", "/get-started"];

function parseArgs(argv) {
  const args = { target: "https://staging.moverestorephysio.com", users: 50, seconds: 60, p95Ms: 2000, timeoutMs: 15000 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--target") args.target = value;
    else if (flag === "--users") args.users = Number(value);
    else if (flag === "--seconds") args.seconds = Number(value);
    else if (flag === "--p95-ms") args.p95Ms = Number(value);
    else if (flag === "--timeout-ms") args.timeoutMs = Number(value);
    else {
      console.error(`unknown argument: ${flag}`);
      process.exit(2);
    }
    i += 1;
  }
  for (const key of ["users", "seconds", "p95Ms", "timeoutMs"]) {
    if (!Number.isFinite(args[key]) || args[key] <= 0) {
      console.error(`--${key} must be a positive number`);
      process.exit(2);
    }
  }
  return args;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const at = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, at)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let url;
  try {
    url = new URL(args.target);
  } catch {
    console.error(`--target is not a URL: ${args.target}`);
    process.exit(2);
  }
  if (PRODUCTION_HOSTS.has(url.hostname)) {
    console.error("Refused: that is the production site, with real patients. Load tests run against staging only.");
    process.exit(2);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    console.error(`Refused: ${url.hostname} is not staging or this machine. Add it to ALLOWED_HOSTS only if it holds no real data.`);
    process.exit(2);
  }

  const base = url.origin;
  const openHoursPath = `/api/appointments/open-hours?from=${ymd(new Date(Date.now() + 86_400_000))}&days=7`;
  const stats = new Map(); // path -> { ms: number[], ok, rateLimited, failed: string[] }
  const record = (path) => {
    if (!stats.has(path)) stats.set(path, { ms: [], ok: 0, rateLimited: 0, failed: [] });
    return stats.get(path);
  };

  async function hit(path) {
    const row = record(path.startsWith("/api/appointments/open-hours") ? "/api/appointments/open-hours" : path);
    const started = performance.now();
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(args.timeoutMs),
        headers: { "user-agent": "moverestore-load-test/1 (staging only)" },
        redirect: "manual",
      });
      await res.arrayBuffer();
      const ms = performance.now() - started;
      if (res.status === 429) row.rateLimited += 1;
      else if (res.status >= 500) row.failed.push(`HTTP ${res.status}`);
      else {
        row.ok += 1;
        row.ms.push(ms);
      }
    } catch (err) {
      row.failed.push(err?.name === "TimeoutError" ? "timeout" : String(err?.cause?.code ?? err?.message ?? err));
    }
  }

  const endAt = Date.now() + args.seconds * 1000;
  console.log(`Load test: ${args.users} users for ${args.seconds}s against ${base} (read-only)`);
  async function user(n) {
    let i = n;
    while (Date.now() < endAt) {
      await hit(PAGES[i % PAGES.length]);
      if (Date.now() >= endAt) break;
      await hit(openHoursPath);
      i += 1;
    }
  }
  const wallStart = Date.now();
  await Promise.all(Array.from({ length: args.users }, (_, n) => user(n)));
  const wallSeconds = (Date.now() - wallStart) / 1000;

  let pass = true;
  let total = 0;
  const lines = [];
  for (const [path, row] of [...stats.entries()].sort()) {
    const sorted = [...row.ms].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const max = sorted[sorted.length - 1] ?? 0;
    total += row.ok + row.rateLimited + row.failed.length;
    const slow = p95 > args.p95Ms;
    if (slow || row.failed.length > 0) pass = false;
    const failures = row.failed.length
      ? ` FAILED ${row.failed.length} (${[...new Set(row.failed)].slice(0, 3).join(", ")})`
      : "";
    lines.push(
      `${slow || row.failed.length ? "✗" : "✓"} ${path.padEnd(30)} ok ${String(row.ok).padStart(5)}  p50 ${Math.round(p50)
        .toString()
        .padStart(5)}ms  p95 ${Math.round(p95).toString().padStart(5)}ms  max ${Math.round(max).toString().padStart(5)}ms` +
        (row.rateLimited ? `  rate-limited ${row.rateLimited}` : "") +
        failures
    );
  }
  console.log(lines.join("\n"));
  console.log(`${total} requests in ${wallSeconds.toFixed(1)}s (${(total / wallSeconds).toFixed(1)}/s). p95 limit ${args.p95Ms}ms.`);
  console.log(pass ? "PASS" : "FAIL");
  process.exit(pass ? 0 : 1);
}

main();
