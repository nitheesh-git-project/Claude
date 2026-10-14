// The money specs' handle on the fake Razorpay (e2e/fake-razorpay.mjs).
//
// The app reaches the fake only through RAZORPAY_API_BASE_URL, and these
// helpers read that same variable through the same rule the app applies
// (src/lib/razorpayApiBase.ts): a loopback origin, never on a production
// deploy, never with a live key. When the rule refuses it, or the fake does
// not answer, or the secrets a signature needs are absent, a spec skips with
// the reason instead of running -- a money spec must never reach a real
// gateway. In the quality gate scripts/ci/run-runner.mjs starts the fake and
// sets the variable for the dev server and for Playwright alike, and an
// undeclared skip fails the runner, so the gate cannot pass by skipping.
//
// Locally: `node e2e/fake-razorpay.mjs &`, then start `npm run dev` AND run
// Playwright with RAZORPAY_API_BASE_URL=http://127.0.0.1:4010 and the same
// RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET in both. docs/rules/testing.md
// has the full recipe.
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { razorpayApiBaseOverride } from "../src/lib/razorpayApiBase";
import { BASE } from "./helpers";

const decision = razorpayApiBaseOverride(process.env);
export const FAKE_GATEWAY_URL = decision.use === "override" ? decision.baseUrl : null;

export type FakePayment = { id: string; amount: number; status: string; order_id: string };
export type FakeRefund = { id: string; amount: number; payment_id: string; status: string };
export type FakeCall = {
  seq: number;
  method: string;
  path: string;
  body: Record<string, unknown>;
  status: number;
};

/**
 * Why this spec cannot run here, or null when it can. `needs` names the
 * secrets the spec signs with.
 */
export async function fakeGatewaySkipReason(needs: { webhook?: boolean } = {}): Promise<string | null> {
  if (!FAKE_GATEWAY_URL) {
    return decision.ignored
      ? `needs the fake Razorpay: ${decision.ignored}`
      : "needs the fake Razorpay (RAZORPAY_API_BASE_URL unset) -- run e2e/fake-razorpay.mjs and point the dev server at it; see docs/rules/testing.md";
  }
  if (!/^rzp_test_/.test(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "")) {
    return "needs a rzp_test_ key id in NEXT_PUBLIC_RAZORPAY_KEY_ID (the same one the dev server has)";
  }
  if (!process.env.RAZORPAY_KEY_SECRET) return "needs RAZORPAY_KEY_SECRET (the dev server's) to sign the checkout callback";
  if (needs.webhook && !process.env.RAZORPAY_WEBHOOK_SECRET) {
    return "needs RAZORPAY_WEBHOOK_SECRET (the dev server's) to sign a webhook";
  }
  try {
    const res = await fetch(`${FAKE_GATEWAY_URL}/__fake/health`);
    const body = (await res.json()) as { fake?: string };
    if (!res.ok || body.fake !== "razorpay") return `${FAKE_GATEWAY_URL} answered, but it is not the fake Razorpay`;
  } catch (error) {
    return `the fake Razorpay is not running at ${FAKE_GATEWAY_URL} (${(error as Error).message})`;
  }
  return null;
}

async function control<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!FAKE_GATEWAY_URL) throw new Error("the fake Razorpay is not configured");
  const res = await fetch(`${FAKE_GATEWAY_URL}/__fake${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = (await res.json()) as T;
  if (!res.ok) throw new Error(`fake gateway ${path}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

export const gateway = {
  /** The last call sequence number, so a case reads only its own calls. */
  async seq(): Promise<number> {
    return (await control<{ seq: number }>("/health")).seq;
  },
  async callsSince(seq: number): Promise<FakeCall[]> {
    return (await control<{ calls: FakeCall[] }>(`/calls?since=${seq}`)).calls;
  },
  /** The patient completing the hosted checkout: a payment captured on the order. */
  async pay(orderId: string, opts: { status?: "captured" | "authorized"; amount?: number } = {}): Promise<FakePayment> {
    return control<FakePayment>(`/orders/${encodeURIComponent(orderId)}/pay`, { method: "POST", body: opts });
  },
  /** An order made without the app, for a fixture written straight to the database. */
  async createOrder(amount: number, receipt: string): Promise<{ id: string; amount: number }> {
    return control(`/orders`, { method: "POST", body: { amount, currency: "INR", receipt } });
  },
  async order(orderId: string): Promise<{ id: string; amount: number; status: string; payments: FakePayment[] }> {
    return control(`/orders/${encodeURIComponent(orderId)}`);
  },
  async refundsFor(paymentId: string): Promise<FakeRefund[]> {
    return (await control<{ items: FakeRefund[] }>(`/refunds?payment_id=${encodeURIComponent(paymentId)}`)).items;
  },
  /** The next refund the app sends is refused, the way Razorpay refuses one. */
  async failNextRefund(opts: { description?: string; reason?: string } = {}): Promise<void> {
    await control(`/refunds/fail-next`, { method: "POST", body: { count: 1, ...opts } });
  },
};

/** What Razorpay Checkout hands the browser: HMAC-SHA256 of `order|payment`. */
export function checkoutSignature(orderId: string, paymentId: string, secret = process.env.RAZORPAY_KEY_SECRET!): string {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

/** A `payment.captured` event exactly as Razorpay posts it (the parts the route reads). */
export function capturedEvent(payment: FakePayment): Record<string, unknown> {
  return {
    entity: "event",
    account_id: "acc_fake",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: payment.id,
          entity: "payment",
          amount: payment.amount,
          currency: "INR",
          status: "captured",
          order_id: payment.order_id,
          method: "upi",
          captured: true,
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Posts a webhook to the app, signed over the exact bytes sent -- the route
 * verifies the raw body, so the body is serialised once, here, and never
 * again. `secret` overrides the signing secret, to forge one.
 */
export async function postWebhook(
  event: Record<string, unknown>,
  { eventId, secret = process.env.RAZORPAY_WEBHOOK_SECRET!, signature }: { eventId: string; secret?: string; signature?: string }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/razorpay/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-event-id": eventId,
      "x-razorpay-signature": signature ?? crypto.createHmac("sha256", secret).update(raw).digest("hex"),
    },
    body: raw,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * The SDK client a spec builds for itself (concurrency.spec.ts makes a real
 * order to hang a fixture purchase on), sent wherever the app's own client is
 * sent: the fake when it is configured, Razorpay test mode otherwise.
 */
export function specRazorpayClient(): Razorpay {
  const client = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
  if (FAKE_GATEWAY_URL) {
    (client as unknown as { api: { rq: { defaults: { baseURL?: string } } } }).api.rq.defaults.baseURL = FAKE_GATEWAY_URL;
  }
  return client;
}
