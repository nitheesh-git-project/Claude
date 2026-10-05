// Which outbound destinations a gate process may reach.
//
// The gate runs the app and the Playwright runner on a CI machine with full
// internet access, against a disposable stack on loopback. Nothing in it has a
// reason to talk to anyone else, and several things must never: a hosted
// Supabase project, the real Razorpay (only its test-mode API, only with test
// keys), Google Calendar, a mail provider. scripts/ci/egress-guard.mjs applies
// this decision to every Node-level request in the processes it is preloaded
// into, and refuses (and records) the rest.
//
// This is a guard, not a sandbox: it covers Node's `fetch` and `http(s)`
// clients, which is everything the server and the Playwright runner use. It
// does not cover the browser's own traffic (Chromium is launched with a host
// resolver rule for that in CI -- see playwright.config.ts), and it says
// nothing about what a third-party SDK does through a raw socket.

import { isPlaceholderRazorpayKey } from "./target.mjs";

const LOOPBACK_NAMES = new Set(["localhost", "::1", "[::1]", "0.0.0.0"]);

/** Hosts allowed whatever the environment says: fonts the app loads through
 *  next/font/google at dev and build time. Fetching a font file sends nothing
 *  about a patient. */
export const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

export const RAZORPAY_API_HOST = "api.razorpay.com";

/** Exact URLs the guard answers itself, with no network, because the tool
 *  that asks has no switch to stop asking and handles a failed answer.
 *  `next dev` checks the registry for a newer Next on every start
 *  (server/dev/hot-reloader-shared-utils.js) and treats a non-OK response
 *  as "staleness unknown". The request carries nothing about anyone; it is
 *  stubbed rather than allowed so the gate still makes no outbound call. */
export const LOCAL_STUBS = {
  "https://registry.npmjs.org/-/package/next/dist-tags": { status: 404, reason: "next dev's version check, answered locally" },
};

/** The stub for a request URL, or null. Query strings never match. */
export function stubFor(url) {
  if (typeof url !== "string") return null;
  return Object.prototype.hasOwnProperty.call(LOCAL_STUBS, url) ? LOCAL_STUBS[url] : null;
}

export function isLoopbackAddress(host) {
  if (typeof host !== "string" || host === "") return false;
  const h = host.toLowerCase();
  return LOOPBACK_NAMES.has(h) || /^127(\.\d{1,3}){3}$/.test(h);
}

/**
 * @param {string|null|undefined} host  destination hostname (no port)
 * @param {Record<string, string|undefined>} env
 * @returns {{allowed: boolean, reason: string}}
 */
export function evaluateDestination(host, env) {
  // A request with no host is a unix socket or a relative path: not the internet.
  if (!host) return { allowed: true, reason: "local" };
  const h = host.toLowerCase();
  if (isLoopbackAddress(h)) return { allowed: true, reason: "loopback" };
  if (FONT_HOSTS.includes(h)) return { allowed: true, reason: "font host" };
  if (h === RAZORPAY_API_HOST) {
    const keyId = env.NEXT_PUBLIC_RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID || "";
    if (/^rzp_test_/.test(keyId) && !isPlaceholderRazorpayKey(keyId)) {
      return { allowed: true, reason: "Razorpay test-mode API with a test key" };
    }
    return { allowed: false, reason: "Razorpay API called without a real rzp_test_ key (live keys are never allowed)" };
  }
  return { allowed: false, reason: `"${h}" is not on the gate's allow-list (loopback, Razorpay test API, font hosts)` };
}

/** Hostname out of the first argument of http.request/fetch, in any of their shapes. */
export function hostFromRequestArgs(args) {
  const [first, second] = args;
  const fromUrl = (value) => {
    try {
      return new URL(typeof value === "string" ? value : value.href ?? String(value)).hostname;
    } catch {
      return null;
    }
  };
  if (typeof first === "string" || first instanceof URL) return fromUrl(first);
  if (first && typeof first === "object" && typeof first.url === "string") return fromUrl(first.url); // fetch(Request)
  const options = first && typeof first === "object" ? first : second && typeof second === "object" ? second : {};
  if (options.socketPath) return null;
  const host = options.hostname ?? options.host;
  if (typeof host !== "string" || host === "") return "localhost"; // node's default for http.request
  return host.replace(/:\d+$/, "");
}
