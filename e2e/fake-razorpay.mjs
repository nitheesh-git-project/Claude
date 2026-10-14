#!/usr/bin/env node
// A local stand-in for the Razorpay API, for the quality gate and the money
// specs. Never a production component.
//
//   node e2e/fake-razorpay.mjs [--port 4010]       (or FAKE_RAZORPAY_PORT)
//
// The app reaches it only through RAZORPAY_API_BASE_URL, which
// src/lib/razorpayApiBase.ts honours for a loopback origin on a non-production
// deploy with a non-live key, and nowhere else. It binds 127.0.0.1 only.
//
// It implements exactly what the app calls (grep src for createRazorpayClient)
// -- nothing more, so a new call the app starts making fails loudly here with a
// 404 naming the path rather than passing against an invented answer:
//
//   POST /v1/orders                     orders.create
//   GET  /v1/orders/:id                 orders.fetch
//   GET  /v1/orders/:id/payments        orders.fetchPayments
//   GET  /v1/payments/:id               payments.fetch
//   POST /v1/payments/:id/refund        payments.refund
//
// Every API call needs HTTP Basic auth (the SDK always sends the key id and
// secret), and every one is recorded. The shapes and the refusals follow
// Razorpay's own: amounts are integer paise, an unknown id is a 400
// BAD_REQUEST_ERROR, and a refund may not exceed what was captured less what
// has already been refunded.
//
// Test controls, under /__fake/ (no auth -- loopback only, test-only):
//
//   GET  /__fake/health                       {ok, fake: "razorpay"}
//   POST /__fake/orders/:id/pay               capture a payment on an order; body
//                                             {status?: "captured"|"authorized", amount?}
//                                             -> the payment entity
//   POST /__fake/orders                       create an order without the SDK (for a
//                                             fixture inserted straight into the database)
//   POST /__fake/refunds/fail-next            the next refund(s) are refused; body
//                                             {count?, description?, code?, statusCode?}
//   GET  /__fake/calls?since=<seq>            recorded API calls after seq
//   GET  /__fake/refunds?payment_id=<id>      refunds recorded against a payment
//   GET  /__fake/orders/:id                   the order with its payments
//
// No dependency beyond Node itself. State is in memory and lasts as long as
// the process; specs isolate themselves by the ids they create, and read
// calls `since` the sequence number they started at.

import http from "node:http";
import { randomBytes } from "node:crypto";

const portArg = process.argv.indexOf("--port");
const PORT = Number(portArg > 0 ? process.argv[portArg + 1] : process.env.FAKE_RAZORPAY_PORT) || 4010;
const HOST = "127.0.0.1";

const orders = new Map();
const payments = new Map();
const refunds = new Map();
const calls = [];
let seq = 0;
let refundFailures = [];

const now = () => Math.floor(Date.now() / 1000);
const id = (prefix) => `${prefix}_${randomBytes(7).toString("hex")}`;

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function razorpayError(res, status, description, code = "BAD_REQUEST_ERROR", reason = "input_validation_failed") {
  send(res, status, { error: { code, description, source: "business", step: "payment_initiation", reason, metadata: {} } });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        // The SDK sends JSON; accept a form body too rather than guess.
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      }
    });
    req.on("error", () => resolve({}));
  });
}

function intPaise(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function createOrder(body) {
  const amount = intPaise(body.amount);
  if (amount === null) return { error: "The amount must be an integer, at least 100 paise" };
  if (amount < 100) return { error: "Order amount less than minimum amount allowed" };
  const order = {
    id: id("order"),
    entity: "order",
    amount,
    amount_paid: 0,
    amount_due: amount,
    currency: body.currency || "INR",
    receipt: body.receipt ?? null,
    offer_id: null,
    status: "created",
    attempts: 0,
    notes: body.notes ?? [],
    created_at: now(),
  };
  orders.set(order.id, order);
  return { order };
}

function capturedOn(payment) {
  return payment.status === "captured" || payment.status === "refunded" ? payment.amount : 0;
}

function payOrder(order, body) {
  const status = body.status === "authorized" ? "authorized" : "captured";
  const amount = intPaise(body.amount) ?? order.amount;
  const payment = {
    id: body.id && /^pay_[A-Za-z0-9]+$/.test(body.id) ? body.id : id("pay"),
    entity: "payment",
    amount,
    currency: order.currency,
    status,
    order_id: order.id,
    invoice_id: null,
    international: false,
    method: "upi",
    amount_refunded: 0,
    refund_status: null,
    captured: status === "captured",
    description: null,
    email: "fixture@example.test",
    contact: "+919999999999",
    fee: status === "captured" ? Math.round(amount * 0.02) : null,
    tax: null,
    error_code: null,
    error_description: null,
    created_at: now(),
  };
  payments.set(payment.id, payment);
  order.attempts += 1;
  if (status === "captured") {
    order.amount_paid += amount;
    order.amount_due = Math.max(0, order.amount - order.amount_paid);
    order.status = "paid";
  } else {
    order.status = "attempted";
  }
  return payment;
}

function refundPayment(payment, body) {
  const forced = refundFailures.shift();
  if (forced) return { status: forced.statusCode, error: forced };
  if (payment.status !== "captured" && payment.status !== "refunded") {
    return { status: 400, error: { description: "The payment has not been captured" } };
  }
  const remaining = capturedOn(payment) - payment.amount_refunded;
  if (remaining <= 0) return { status: 400, error: { description: "The payment has been fully refunded already" } };
  const requested = body.amount === undefined || body.amount === null || body.amount === "" ? remaining : intPaise(body.amount);
  if (requested === null) return { status: 400, error: { description: "The amount must be an integer" } };
  if (requested > remaining) {
    return { status: 400, error: { description: "The refund amount provided is greater than amount captured" } };
  }
  const refund = {
    id: id("rfnd"),
    entity: "refund",
    amount: requested,
    currency: payment.currency,
    payment_id: payment.id,
    notes: body.notes ?? [],
    receipt: body.receipt ?? null,
    acquirer_data: { rrn: null },
    created_at: now(),
    batch_id: null,
    status: "processed",
    speed_processed: "normal",
    speed_requested: body.speed ?? "normal",
  };
  refunds.set(refund.id, refund);
  payment.amount_refunded += requested;
  payment.refund_status = payment.amount_refunded >= capturedOn(payment) ? "full" : "partial";
  if (payment.refund_status === "full") payment.status = "refunded";
  return { status: 200, refund };
}

function record(req, url, body, status) {
  seq += 1;
  calls.push({
    seq,
    at: new Date().toISOString(),
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    status,
  });
  if (calls.length > 5000) calls.splice(0, calls.length - 5000);
}

function authorised(req) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
  return Boolean(user) && Boolean(pass);
}

async function api(req, res, url) {
  const body = req.method === "POST" ? await readBody(req) : {};
  const reply = (status, payload) => {
    record(req, url, body, status);
    send(res, status, payload);
  };
  const fail = (status, description) => {
    record(req, url, body, status);
    razorpayError(res, status, description);
  };

  if (!authorised(req)) {
    record(req, url, body, 401);
    return razorpayError(res, 401, "The api key provided is invalid", "BAD_REQUEST_ERROR", "authentication_failed");
  }

  const parts = url.pathname.split("/").filter(Boolean); // ["v1", ...]
  if (req.method === "POST" && parts.length === 2 && parts[1] === "orders") {
    const created = createOrder(body);
    return created.error ? fail(400, created.error) : reply(200, created.order);
  }
  if (req.method === "GET" && parts[1] === "orders" && parts.length >= 3) {
    const order = orders.get(parts[2]);
    if (!order) return fail(400, "The id provided does not exist");
    if (parts.length === 3) return reply(200, order);
    if (parts.length === 4 && parts[3] === "payments") {
      const items = [...payments.values()].filter((p) => p.order_id === order.id);
      return reply(200, { entity: "collection", count: items.length, items });
    }
  }
  if (parts[1] === "payments" && parts.length >= 3) {
    const payment = payments.get(parts[2]);
    if (!payment) return fail(400, "The id provided does not exist");
    if (req.method === "GET" && parts.length === 3) return reply(200, payment);
    if (req.method === "POST" && parts.length === 4 && parts[3] === "refund") {
      const result = refundPayment(payment, body);
      if (result.refund) return reply(200, result.refund);
      record(req, url, body, result.status);
      return razorpayError(
        res,
        result.status,
        result.error.description,
        result.error.code ?? "BAD_REQUEST_ERROR",
        result.error.reason ?? "input_validation_failed"
      );
    }
  }
  fail(404, `The fake gateway does not implement ${req.method} ${url.pathname}`);
}

async function control(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["__fake", ...]
  const body = req.method === "POST" ? await readBody(req) : {};
  if (req.method === "GET" && parts[1] === "health") return send(res, 200, { ok: true, fake: "razorpay", seq });
  if (req.method === "GET" && parts[1] === "calls") {
    const since = Number(url.searchParams.get("since")) || 0;
    return send(res, 200, { seq, calls: calls.filter((c) => c.seq > since) });
  }
  if (req.method === "GET" && parts[1] === "refunds") {
    const paymentId = url.searchParams.get("payment_id");
    return send(res, 200, { items: [...refunds.values()].filter((r) => !paymentId || r.payment_id === paymentId) });
  }
  if (parts[1] === "orders") {
    if (req.method === "POST" && parts.length === 2) {
      const created = createOrder(body);
      return created.error ? razorpayError(res, 400, created.error) : send(res, 200, created.order);
    }
    const order = orders.get(parts[2]);
    if (!order) return razorpayError(res, 404, `no such order ${parts[2]}`);
    if (req.method === "GET" && parts.length === 3) {
      return send(res, 200, { ...order, payments: [...payments.values()].filter((p) => p.order_id === order.id) });
    }
    if (req.method === "POST" && parts[3] === "pay") return send(res, 200, payOrder(order, body));
  }
  if (req.method === "POST" && parts[1] === "refunds" && parts[2] === "fail-next") {
    const count = Math.max(1, Math.min(20, Number(body.count) || 1));
    const failure = {
      statusCode: Number(body.statusCode) || 400,
      code: body.code || "BAD_REQUEST_ERROR",
      description:
        body.description || "Your account does not have enough balance to carry out the refund operation.",
      reason: body.reason || "insufficient_balance",
    };
    refundFailures = Array.from({ length: count }, () => ({ ...failure }));
    return send(res, 200, { armed: count, failure });
  }
  send(res, 404, { error: `unknown control ${req.method} ${url.pathname}` });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const handler = url.pathname.startsWith("/__fake/") ? control : url.pathname.startsWith("/v1/") ? api : null;
  if (!handler) return send(res, 404, { error: `not a Razorpay path: ${url.pathname}` });
  handler(req, res, url).catch((error) => send(res, 500, { error: String(error?.message ?? error) }));
});

server.listen(PORT, HOST, () => {
  console.log(`fake Razorpay listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
