#!/usr/bin/env node
// Runs `next start` across several Node processes on one port.
//
// Why this exists: a load test found the single `next start` process was the
// app's ceiling once the database stopped being one. With 200 concurrent
// visitors browsing the public pages (412 requests a second sustained), one
// admin dashboard render went from 4.0s to 15.9s -- the JS thread was the
// queue, not Supabase, which held a flat ~290ms a query throughout. Node
// renders React on one thread, so the only way past that is more threads.
//
// It uses `node:cluster` rather than a reverse proxy because the primary
// already knows how to hand an accepted connection to a worker: a worker's
// own `server.listen()` is intercepted and served off the primary's shared
// handle, so every worker answers on the same port with nothing in front of
// it. `next start` boots its server in-process, so importing the CLI inside
// a worker is all it takes.
//
// Usage:  node scripts/start-cluster.mjs        (or npm run start:cluster)
//         WEB_CONCURRENCY=2 npm run start:cluster
//
// Two consequences are real and are handled here rather than discovered
// later:
//
// 1. **Anything this app remembers in a module variable is now per worker.**
//    The lazy sweeps are the case that matters -- `retryDueMeetSyncs` and
//    `retryDueMeetAccess` hold a one-minute floor and `runRiskSweep` a
//    five-minute one, each in a module-level timestamp, and the comment on
//    every one of them says "per server instance". With N workers those
//    floors are still correct per worker and so the clinic can see up to N
//    sweeps per window. That is safe -- each sweep claims its rows before
//    calling Google and every row carries its own attempt cap -- but it does
//    spend an appointment's automatic retries faster, so the default worker
//    count is deliberately small rather than "one per core".
//
// 2. **`SUPABASE_MAX_IN_FLIGHT` is per process too.** Left alone, four
//    workers would carry four times the socket budget that was measured, and
//    that budget exists precisely to stop the origin being buried. So unless
//    the operator set it themselves, it is divided across the workers here --
//    see the note on the budget constant, which is where the division stops
//    being arithmetic and starts being a measurement.
import cluster from "node:cluster";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The socket budget for the whole server, shared out between the workers.
//
// 192 rather than the single-process default of 96, and that is measured
// too. Dividing 96 across four workers gives each 24, and a single admin
// render issues batches of ~56 queries -- so every batch queued two deep and
// one admin on an idle server went from 4.0s to 6.7s, a regression handed to
// the quiet case to protect the busy one. Halving the divisor fixed it
// without giving the burst back:
//
//   4 workers x 24 (total 96)   admin alone 6,685ms   contended 11,632ms   public 564 rps
//   4 workers x 48 (total 192)  admin alone 3,730ms   contended 11,340ms   public 580 rps
//   4 workers x 96 (total 384)  admin alone 3,691ms   contended  7,474ms   public 454 rps
//
// 384 is the fastest dashboard and the slowest public site, and the public
// pages are the part patients use -- so the default takes the middle row and
// an operator who would rather have the dashboard can raise the variable.
// The `Math.min` keeps one or two workers on the 96 the single-process
// measurement settled on, so this only ever divides.
const TOTAL_IN_FLIGHT_BUDGET = 192;
const SINGLE_PROCESS_CAP = 96;

function workerCount() {
  const asked = Number(process.env.WEB_CONCURRENCY);
  if (Number.isFinite(asked) && asked >= 1) return Math.floor(asked);
  // Not one per core: the box also runs the OS, and every extra worker
  // multiplies the lazy sweeps above. Two to four is the useful range.
  return Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length));
}

const workers = workerCount();

if (cluster.isPrimary) {
  // Divide the measured socket budget rather than multiplying it. An
  // operator who set the variable themselves meant that number per process,
  // so theirs is passed through untouched.
  if (!process.env.SUPABASE_MAX_IN_FLIGHT) {
    process.env.SUPABASE_MAX_IN_FLIGHT = String(
      Math.max(8, Math.min(SINGLE_PROCESS_CAP, Math.floor(TOTAL_IN_FLIGHT_BUDGET / workers)))
    );
  }

  console.log(
    `[cluster] starting ${workers} worker(s) on port ${process.env.PORT ?? 3000}, ` +
      `SUPABASE_MAX_IN_FLIGHT=${process.env.SUPABASE_MAX_IN_FLIGHT} per worker`
  );

  for (let i = 0; i < workers; i++) cluster.fork();

  // A worker that dies is replaced, but a worker that dies *immediately* and
  // repeatedly is a broken build, and respawning it forever turns that into
  // a fork bomb that hides the error. Ten restarts inside a minute is the
  // line: past it the primary exits so the platform's own restart policy
  // (and its logs) take over.
  let shuttingDown = false;
  const restarts = [];
  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) return;
    const now = Date.now();
    while (restarts.length && now - restarts[0] > 60_000) restarts.shift();
    restarts.push(now);
    console.error(
      `[cluster] worker ${worker.process.pid} exited (${signal || `code ${code}`}); ` +
        `${restarts.length} restart(s) in the last minute`
    );
    if (restarts.length > 10) {
      console.error("[cluster] too many restarts in one minute -- giving up so the error is visible");
      process.exit(1);
    }
    cluster.fork();
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      shuttingDown = true;
      for (const worker of Object.values(cluster.workers ?? {})) worker?.kill(signal);
      // Give the workers their own keep-alive drain before the primary goes.
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  }
} else {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  // The CLI reads argv, so shape it as if `next start` had been typed. The
  // port is left to next's own default/PORT handling so one place decides it.
  process.argv = [process.argv[0], path.join(root, "node_modules/next/dist/bin/next"), "start"];
  await import("next/dist/bin/next");
}
