// Preloaded with NODE_OPTIONS="--import <this file>" into `next dev` and the
// Playwright runner, so every Node-level request they make is checked against
// scripts/ci/lib/egress.mjs. A denied request throws (so the test or route
// that made it fails loudly) and is appended to $ARTIFACT_DIR/egress-denied.log,
// which run-runner.mjs and the workflow treat as a failure on its own: a
// request that was refused and then swallowed by a try/catch must still turn
// the job red.
//
// A guard, not a sandbox -- see lib/egress.mjs for what it does not cover.

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { evaluateDestination, hostFromRequestArgs, stubFor } from "./lib/egress.mjs";

const logFile = path.join(process.env.ARTIFACT_DIR || process.env.E2E_ARTIFACT_DIR || "e2e-artifacts", "egress-denied.log");

function record(kind, host, detail, reason) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(
      logFile,
      `${new Date().toISOString()} pid=${process.pid} ${kind} host=${host ?? "?"} ${detail} :: ${reason}\n`
    );
  } catch {
    // The log is evidence; failing to write it must not hide the refusal below.
  }
}

function check(kind, args) {
  const host = hostFromRequestArgs(args);
  const verdict = evaluateDestination(host, process.env);
  if (verdict.allowed) return;
  const first = args[0];
  const detail = typeof first === "string" ? first.split("?")[0] : first?.href?.split("?")[0] ?? first?.url?.split?.("?")[0] ?? "";
  record(kind, host, detail, verdict.reason);
  throw new Error(`egress denied by the quality gate: ${verdict.reason} (host ${host})`);
}

if (!globalThis.__gateEgressGuard) {
  globalThis.__gateEgressGuard = true;

  const realFetch = globalThis.fetch;
  if (typeof realFetch === "function") {
    globalThis.fetch = function guardedFetch(...args) {
      const first = args[0];
      const url = typeof first === "string" ? first : first?.href ?? first?.url;
      const stub = stubFor(url);
      if (stub) return Promise.resolve(new Response(null, { status: stub.status }));
      try {
        check("fetch", args);
      } catch (error) {
        return Promise.reject(error);
      }
      return realFetch.apply(this, args);
    };
  }

  for (const [name, mod] of [["http", http], ["https", https]]) {
    for (const method of ["request", "get"]) {
      const real = mod[method];
      mod[method] = function guarded(...args) {
        check(`${name}.${method}`, args);
        return real.apply(this, args);
      };
    }
  }
  syncBuiltinESMExports();
}
