import crypto from "node:crypto";
const BASE = "http://localhost:3000";
// Must match the running server's RAZORPAY_WEBHOOK_SECRET, or every
// delivery below is correctly refused as an invalid signature and the run
// looks like a product failure.
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "qa_webhook_secret_2026";
const sign = (b) => crypto.createHmac("sha256", SECRET).update(b).digest("hex");
const post = (body, sig) => fetch(`${BASE}/api/razorpay/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(sig ? { "x-razorpay-signature": sig } : {}) },
  body,
});
const line = (id, name, got, want) =>
  console.log(`${got === want ? "PASS" : "FAIL"}  ${id.padEnd(14)} ${name.padEnd(56)} got ${got}, want ${want}`);

console.log("=== §16.3 webhook ===");
const evt = (id) => JSON.stringify({
  event: "payment.captured", id,
  payload: { payment: { entity: { id: "pay_qa_" + id, order_id: "order_qa_" + id, amount: 199900 } } },
});

let b = evt("evt_qa_001");
line("PAY-WH-001a", "no signature header is refused", (await post(b)).status, 400);
line("PAY-WH-001b", "a wrong signature is refused", (await post(b, "deadbeef")).status, 400);
// Re-serialised body: same JSON, different bytes -> signature must not verify.
const reserialised = JSON.stringify(JSON.parse(b) , null, 1);
line("PAY-WH-001c", "a re-serialised body fails the raw-body check", (await post(reserialised, sign(b))).status, 400);

const first = await post(b, sign(b));
const second = await post(b, sign(b));
console.log(`      PAY-DUP-004    duplicate delivery: first=${first.status} second=${second.status} (neither may be 5xx)`);
line("PAY-DUP-004", "a duplicate webhook is not an error", second.status < 500, true);

const failed = JSON.stringify({ event: "payment.failed", id: "evt_qa_002", payload: { payment: { entity: { id: "pay_x", order_id: "order_x" } } } });
line("PAY-WH-003", "a non-capture event is accepted and ignored", (await post(failed, sign(failed))).status < 500, true);

console.log("\n=== §18.2 anonymous callers (SEC-ROUTE-002) ===");
const ROUTES = [
  "/api/appointments/create", "/api/appointments/cancel", "/api/appointments/complete-session",
  "/api/patient/condition-profile/submit", "/api/patient/respond-suggestion",
  "/api/therapist/save-availability", "/api/therapist/care-plan/submit",
  "/api/therapist/suggest-session", "/api/therapist/reveal-contact",
  "/api/hospital/withdraw-referral", "/api/medical-documents/view",
  "/api/razorpay/create-order", "/api/razorpay/verify", "/api/care-plan/create-order",
  "/api/home-visit/create-order", "/api/home-visit/book-cash",
  "/api/admin/approve-account", "/api/admin/settle-therapist-payout", "/api/admin/refund-package",
  "/api/admin/set-admin-scope", "/api/admin/update-setting", "/api/admin/create-booking",
  "/api/admin/author-care-plan", "/api/admin/withdraw-care-plan", "/api/admin/grant-session-credits",
];
let bad = [];
for (const r of ROUTES) {
  const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const body = await res.text();
  const ok = res.status === 401 || res.status === 403 || res.status === 404;
  const leaks = /relation|column|postgres|stack|at Object\.|syntax error/i.test(body);
  if (!ok || leaks) bad.push(`${r} -> ${res.status} ${leaks ? "LEAKS INTERNALS" : ""} ${body.slice(0, 90)}`);
}
console.log(`${bad.length === 0 ? "PASS" : "FAIL"}  SEC-ROUTE-002  ${ROUTES.length} routes refuse an anonymous caller with no internals leaked`);
bad.forEach((x) => console.log("      " + x));
