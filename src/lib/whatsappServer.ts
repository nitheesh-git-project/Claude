import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTestAddress } from "@/lib/emailControls";
import {
  decideWhatsApp,
  hasConsent,
  maskNumber,
  parseWhatsAppControls,
  type WhatsAppControlsRead,
  type WhatsAppKind,
  type WhatsAppSkipReason,
} from "@/lib/whatsappRules";
import { renderTemplate, WHATSAPP_TEMPLATES, type WhatsAppMessage } from "@/lib/whatsappTemplates";

// Sends one WhatsApp template message, server only. Built and wired now,
// switched on later: nothing goes out until all of these are true --
//   1. WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set (the
//      clinic's Meta Business account, after its business verification);
//   2. the template is approved in Meta's WhatsApp Manager under the same
//      name (whatsappTemplates.ts, docs/whatsapp/TEMPLATES.md);
//   3. Settings -> WhatsApp -> Send WhatsApp messages is on (it starts off);
//   4. the patient said yes, and has not since said no or replied STOP.
// Every attempt, sent or not, is a row in `whatsapp_log` with the reason.
// Never throws; gives up after WHATSAPP_TIMEOUT_MS.
//
// The provider sits behind `WhatsAppProvider`, so moving from Meta's own
// Cloud API to a reseller (Gupshup, Twilio, Interakt...) is one new object,
// not a change to any caller.

const WHATSAPP_TIMEOUT_MS = 8000;

export type WhatsAppResult = "sent" | "skipped" | "failed";

export interface WhatsAppProvider {
  readonly name: string;
  configured(): boolean;
  send(to: string, message: WhatsAppMessage, signal: AbortSignal): Promise<{ ok: boolean; status: number }>;
}

/** Meta's WhatsApp Cloud API (graph.facebook.com). */
export const metaCloudProvider: WhatsAppProvider = {
  name: "meta_cloud",
  configured() {
    return !!process.env.WHATSAPP_ACCESS_TOKEN?.trim() && !!process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  },
  async send(to, message, signal) {
    const version = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v21.0";
    const template = WHATSAPP_TEMPLATES[message.template];
    const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID!.trim()}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          components: [{ type: "body", parameters: message.params.map((text) => ({ type: "text", text })) }],
        },
      }),
      signal,
    });
    return { ok: res.ok, status: res.status };
  },
};

export function whatsappProvider(): WhatsAppProvider {
  return metaCloudProvider;
}

export function whatsappConfigured(): boolean {
  return whatsappProvider().configured();
}

type AdminClient = ReturnType<typeof createAdminClient>;

function notMigrated(error: { code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

export async function loadWhatsAppControls(admin: AdminClient): Promise<WhatsAppControlsRead> {
  try {
    const { data, error } = await admin.from("whatsapp_controls").select("sending_enabled, test_number, disabled_kinds").eq("id", 1).maybeSingle();
    if (notMigrated(error)) return { status: "ok", controls: parseWhatsAppControls(null) };
    if (error) return { status: "unreadable" };
    return { status: "ok", controls: parseWhatsAppControls(data) };
  } catch {
    return { status: "unreadable" };
  }
}

/** Whether the person said yes (latest row wins). A failed read is "no":
 *  a message nobody agreed to is the one mistake this must not make. */
export async function loadWhatsAppConsent(admin: AdminClient, patientId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("whatsapp_consents")
      .select("choice, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return false;
    return hasConsent(data ?? []);
  } catch {
    return false;
  }
}

async function logAttempt(
  admin: AdminClient,
  row: { kind: WhatsAppKind; to: string | null; message: WhatsAppMessage; status: WhatsAppResult; reason: WhatsAppSkipReason | null; redirected: boolean; httpStatus?: number | null }
) {
  try {
    await admin.from("whatsapp_log").insert({
      kind: row.kind,
      recipient: row.to ? maskNumber(row.to) : "-",
      template: row.message.template,
      preview: renderTemplate(row.message).slice(0, 500),
      status: row.status,
      reason: row.reason,
      redirected: row.redirected,
      http_status: row.httpStatus ?? null,
    });
  } catch {
    // The log is for the screen; never let it fail the send.
  }
}

/** Sends (or deliberately does not send) one template message to a patient. */
export async function deliverWhatsApp(
  patient: { id: string; email: string | null; phone: string | null },
  message: WhatsAppMessage,
  kind: WhatsAppKind
): Promise<{ result: WhatsAppResult; reason: WhatsAppSkipReason | null }> {
  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch {
    return { result: "skipped", reason: "controls_unreadable" };
  }
  const testAccount = !!patient.email && isTestAddress(patient.email);
  const [controls, consented] = await Promise.all([
    loadWhatsAppControls(admin),
    testAccount ? Promise.resolve(false) : loadWhatsAppConsent(admin, patient.id),
  ]);
  const decision = decideWhatsApp({ kind, phone: patient.phone, testAccount, consented, controls });
  if (decision.action === "skip") {
    // Only worth a log line once somebody could expect a message: a patient
    // who never opted in is the normal case, not news.
    if (decision.reason !== "no_consent") {
      await logAttempt(admin, { kind, to: null, message, status: "skipped", reason: decision.reason, redirected: false });
    }
    return { result: "skipped", reason: decision.reason };
  }
  const provider = whatsappProvider();
  if (!provider.configured()) {
    await logAttempt(admin, { kind, to: decision.to, message, status: "skipped", reason: "not_configured", redirected: decision.redirected });
    return { result: "skipped", reason: "not_configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHATSAPP_TIMEOUT_MS);
  let result: WhatsAppResult = "failed";
  let httpStatus: number | null = null;
  try {
    const sent = await provider.send(decision.to, message, controller.signal);
    httpStatus = sent.status;
    if (sent.ok) result = "sent";
    else console.error(`WhatsApp "${message.template}" refused by ${provider.name}: ${sent.status}`);
  } catch (e) {
    console.error(`WhatsApp "${message.template}" could not be sent`, e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
  await logAttempt(admin, { kind, to: decision.to, message, status: result, reason: null, redirected: decision.redirected, httpStatus });
  return { result, reason: null };
}
