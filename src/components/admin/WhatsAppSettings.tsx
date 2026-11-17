import { createAdminClient } from "@/lib/supabase/admin";
import { loadWhatsAppControls, whatsappConfigured } from "@/lib/whatsappServer";
import { WHATSAPP_KINDS } from "@/lib/whatsappRules";
import { WHATSAPP_TEMPLATES } from "@/lib/whatsappTemplates";
import WhatsAppControlsEditor, { type WhatsAppLogRow } from "@/components/admin/WhatsAppControlsEditor";

// Settings -> WhatsApp. Self-fetching like EmailSettings; Settings is Master
// Admin only and its route is requireAdminScope("settings"). Shows whether
// the server is set up, the switches, how many patients have said yes, the
// templates to submit to Meta, and the last 100 attempts.
export default async function WhatsAppSettings() {
  const admin = createAdminClient();
  const [controls, log, consented] = await Promise.all([loadWhatsAppControls(admin), loadLog(admin), countConsented(admin)]);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">WhatsApp</h2>
      <p className="text-sm text-slate-600 mb-4">
        Booking, cancellation and reminder messages on WhatsApp, beside the emails, for patients who said yes on their profile. A patient can
        stop them any time from their profile, or by replying STOP. Test accounts are never messaged.
      </p>
      <WhatsAppControlsEditor
        configured={whatsappConfigured()}
        controls={controls.status === "ok" ? controls.controls : null}
        kinds={[...WHATSAPP_KINDS]}
        consented={consented}
        templates={Object.values(WHATSAPP_TEMPLATES).map((t) => ({ name: t.name, body: t.body }))}
        log={log.status === "ok" ? log.rows : null}
      />
    </div>
  );
}

async function loadLog(admin: ReturnType<typeof createAdminClient>): Promise<{ status: "ok"; rows: WhatsAppLogRow[] } | { status: "unreadable" }> {
  try {
    const { data, error } = await admin
      .from("whatsapp_log")
      .select("id, created_at, kind, recipient, template, status, reason, redirected")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error?.code === "42P01" || error?.code === "PGRST205") return { status: "ok", rows: [] };
    if (error) return { status: "unreadable" };
    return {
      status: "ok",
      rows: (data ?? []).map((r) => ({
        id: String(r.id),
        createdAt: String(r.created_at),
        recipient: String(r.recipient),
        template: String(r.template),
        status: r.status as WhatsAppLogRow["status"],
        reason: typeof r.reason === "string" ? r.reason : null,
        redirected: r.redirected === true,
      })),
    };
  } catch {
    return { status: "unreadable" };
  }
}

/** Patients whose latest choice is yes. Null when it could not be read. */
async function countConsented(admin: ReturnType<typeof createAdminClient>): Promise<number | null> {
  try {
    const { data, error } = await admin.from("whatsapp_consents").select("patient_id, choice, created_at").order("created_at", { ascending: false }).limit(5000);
    if (error?.code === "42P01" || error?.code === "PGRST205") return 0;
    if (error) return null;
    const latest = new Map<string, string>();
    for (const r of data ?? []) if (!latest.has(String(r.patient_id))) latest.set(String(r.patient_id), String(r.choice));
    return [...latest.values()].filter((c) => c === "granted").length;
  } catch {
    return null;
  }
}
