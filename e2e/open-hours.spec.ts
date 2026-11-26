// OH: GET /api/appointments/open-hours -- the one answer every session
// picker (the wizard, Change time, programme and home-visit scheduling,
// Suggest a session, admin Book a session / edit / assign referral) asks
// before it offers a time (openHours.ts, docs/rules/booking.md).
//
// Read-only: it asks and checks the shape of the answer, never writes a
// roster row, so it cannot disturb the roster specs sharing this stack.
import { test, expect } from "@playwright/test";
import { BASE, QA_EMAILS, cookieHeaderFor } from "./helpers";

const FROM = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const URL = `${BASE}/api/appointments/open-hours?from=${FROM}&days=7`;

function wellFormed(body: { checked?: unknown; open?: unknown }) {
  // Either "not checked" (offer every hour) or the open instants.
  if (body.checked === false) return true;
  return body.checked === true && Array.isArray(body.open) && body.open.every((n) => typeof n === "number");
}

test("OH-001: anyone gets the clinic-wide answer, plain and for a home visit", async () => {
  const plain = await fetch(URL);
  expect(plain.status).toBe(200);
  expect(wellFormed(await plain.json())).toBe(true);

  const home = await fetch(`${URL}&visitMode=home_visit`);
  expect(home.status).toBe(200);
  expect(wellFormed(await home.json())).toBe(true);
});

test("OH-002: one therapist's hours, or the roster around one session, need someone signed in", async () => {
  const someone = "00000000-0000-0000-0000-000000000001";
  expect((await fetch(`${URL}&therapistId=${someone}`)).status).toBe(401);
  expect((await fetch(`${URL}&exclude=${someone}`)).status).toBe(401);
  expect((await fetch(`${URL}&therapistId=me`)).status).toBe(401);
  // Not an id at all is a 400, signed in or not.
  expect((await fetch(`${URL}&therapistId=not-an-id`)).status).toBe(400);
});

test("OH-003: a signed-in therapist asks about their own hours as 'me'", async () => {
  const res = await fetch(`${URL}&therapistId=me`, { headers: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistA) } });
  expect(res.status).toBe(200);
  expect(wellFormed(await res.json())).toBe(true);
});
