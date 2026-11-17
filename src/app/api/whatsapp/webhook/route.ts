import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStopMessage, toWhatsAppNumber } from "@/lib/whatsappRules";

// Meta's WhatsApp webhook: the one way a patient's reply reaches us. Today it
// does one job -- a STOP (or UNSUBSCRIBE, "band karo"...) reply records a
// withdrawn consent for every patient with that number, so nothing more is
// sent to them. Everything else is acknowledged and ignored.
//
// GET  is Meta's subscription check: hub.mode=subscribe and hub.verify_token
//      equal to WHATSAPP_VERIFY_TOKEN answers hub.challenge as plain text;
//      anything else is 403; the token unset is 503 ("not set up").
// POST is checked against WHATSAPP_APP_SECRET over the RAW body (X-Hub-
//      Signature-256: sha256=<hex>), never a re-serialised parse, which does
//      not round-trip byte for byte. A bad or missing signature is 403 and
//      changes nothing; the secret unset is 503. A good one is always 200 --
//      Meta retries anything else for days.
// No user session here and none needed: the signature is the authentication.

export async function GET(request: NextRequest) {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!expected) return NextResponse.json({ error: "WhatsApp webhook not configured" }, { status: 503 });
  const p = request.nextUrl.searchParams;
  const token = p.get("hub.verify_token") ?? "";
  const ok =
    p.get("hub.mode") === "subscribe" &&
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

type Inbound = { from?: string; type?: string; text?: { body?: string }; button?: { text?: string } };

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "WhatsApp webhook not configured" }, { status: 503 });

  const raw = await request.text();
  const header = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const valid = header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!valid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: true });
  }
  const stops = new Set<string>();
  const entries = (payload as { entry?: { changes?: { value?: { messages?: Inbound[] } }[] }[] })?.entry ?? [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) {
        const text = m?.type === "button" ? m.button?.text : m?.text?.body;
        const from = toWhatsAppNumber(m?.from ? `+${String(m.from).replace(/^\+/, "")}` : null);
        if (from && isStopMessage(text)) stops.add(from);
      }
    }
  }
  if (stops.size > 0) await recordStops(createAdminClient(), [...stops]);
  return NextResponse.json({ received: true });
}

/** A withdrawn consent for every patient whose stored number is one of these.
 *  Stored numbers are written many ways ("+91 98765 43210", "9876543210"), so
 *  the candidates are found by the last digits and checked exactly after. */
async function recordStops(admin: ReturnType<typeof createAdminClient>, numbers: string[]) {
  for (const number of numbers) {
    const tail = number.slice(-10).split("").join("%");
    const { data } = await admin.from("profiles").select("id, phone").eq("role", "patient").ilike("phone", `%${tail}`).limit(20);
    const ids = (data ?? []).filter((p) => toWhatsAppNumber(p.phone as string | null) === number).map((p) => p.id as string);
    if (ids.length === 0) continue;
    await admin.from("whatsapp_consents").insert(ids.map((patient_id) => ({ patient_id, choice: "withdrawn", source: "stop_reply" })));
  }
}
