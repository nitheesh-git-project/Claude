// Where the server's Razorpay client sends its API calls.
//
// The `razorpay` SDK hard-codes https://api.razorpay.com. The quality gate
// (and a developer running the money specs) points the app at a local fake
// gateway instead (e2e/fake-razorpay.mjs), through RAZORPAY_API_BASE_URL, so
// a captured payment, a refund and a refused refund can be driven end to end
// without a real gateway ever being called.
//
// That variable is a way to send a Razorpay key id and secret somewhere other
// than Razorpay, so it is honoured only when every one of these holds, and
// ignored otherwise:
//
//   1. It parses as a plain http(s) origin -- no credentials, no path, no
//      query -- because the SDK appends `/v1/...` itself.
//   2. Its host is loopback (127.0.0.0/8, ::1, localhost). A fake gateway runs
//      on the same machine as the app; nothing else has a reason to receive
//      the keys.
//   3. This is not a production deploy (`VERCEL_ENV === "production"`), and
//      the key id is not a live one (`rzp_live_`). Either is a hard no: a live
//      key's secret never leaves for anywhere but Razorpay.
//
// Dependency-free so the decision is unit-tested (razorpayApiBase.test.ts)
// and so the e2e helpers can apply exactly the same rule.

export type RazorpayApiBaseDecision =
  | { use: "razorpay"; baseUrl: null; ignored: null }
  | { use: "override"; baseUrl: string; ignored: null }
  | { use: "razorpay"; baseUrl: null; ignored: string };

const LOOPBACK_NAMES = new Set(["localhost", "::1", "[::1]"]);

export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return LOOPBACK_NAMES.has(h) || /^127(\.\d{1,3}){3}$/.test(h);
}

/**
 * Whether the server may send its Razorpay calls to `RAZORPAY_API_BASE_URL`,
 * and the origin to use when it may. `ignored` says why an override that was
 * set is not being used, so the caller can log it once.
 */
export function razorpayApiBaseOverride(
  env: Record<string, string | undefined>
): RazorpayApiBaseDecision {
  const raw = env.RAZORPAY_API_BASE_URL?.trim();
  if (!raw) return { use: "razorpay", baseUrl: null, ignored: null };

  const refuse = (why: string): RazorpayApiBaseDecision => ({
    use: "razorpay",
    baseUrl: null,
    ignored: `RAZORPAY_API_BASE_URL is ignored: ${why}`,
  });

  if (env.VERCEL_ENV === "production") return refuse("this is a production deploy");
  const keyId = env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? env.RAZORPAY_KEY_ID ?? "";
  if (/^rzp_live_/.test(keyId.trim())) return refuse("the Razorpay key is a live key");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuse("it is not a URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return refuse("it is not an http(s) URL");
  if (url.username || url.password) return refuse("it carries credentials");
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    return refuse("it must be an origin only (the client adds /v1/...)");
  }
  if (!isLoopbackHost(url.hostname)) return refuse(`"${url.hostname}" is not a loopback host`);

  return { use: "override", baseUrl: url.origin, ignored: null };
}
