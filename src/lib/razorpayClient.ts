// The one way server code gets a Razorpay client.
//
// Every route that creates an order, reads one back or sends a refund builds
// its client here, so where those calls go is decided in exactly one place:
// Razorpay itself, or -- for the quality gate and the money specs only -- the
// loopback fake gateway named by RAZORPAY_API_BASE_URL. Which of the two is a
// pure decision with its own tests (razorpayApiBase.ts); this file only
// applies it. A route that called `new Razorpay(...)` directly would quietly
// reach the real gateway in CI, so none does.
//
// Throws exactly as the SDK constructor does when the key id is missing
// ("`key_id` or `oauthToken` is mandatory"); callers already guard that.

import "server-only";
import Razorpay from "razorpay";
import { razorpayApiBaseOverride } from "@/lib/razorpayApiBase";

let warned = false;

export function createRazorpayClient(): Razorpay {
  const client = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
  const decision = razorpayApiBaseOverride(process.env);
  if (decision.use === "override") {
    // The SDK keeps one axios instance per client and builds every request
    // URL relative to its baseURL (node_modules/razorpay/dist/api.js), so
    // moving that is the whole override -- auth, headers and paths unchanged.
    (client as unknown as { api: { rq: { defaults: { baseURL?: string } } } }).api.rq.defaults.baseURL =
      decision.baseUrl;
  } else if (decision.ignored && !warned) {
    warned = true;
    console.error(decision.ignored);
  }
  return client;
}
