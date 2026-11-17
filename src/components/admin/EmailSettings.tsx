import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, loadEmailControls } from "@/lib/emailServer";
import { EMAIL_KINDS } from "@/lib/emailControls";
import EmailControlsEditor, { type EmailLogRow } from "@/components/admin/EmailControlsEditor";

// Settings -> Emails: the master switch, test mode, each kind's switch, the
// test button and the last 100 attempts. Self-fetching like
// ProfileWidgetSettings, rendered only on Settings (Master Admin only); its
// routes are requireAdminScope("settings"). An unreadable read says "we
// couldn't check" instead of drawing switches that would read as a fact.
export default async function EmailSettings() {
  const admin = createAdminClient();
  const [controls, log] = await Promise.all([loadEmailControls(admin), loadEmailLog(admin)]);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Emails</h2>
      <p className="text-sm text-slate-600 mb-4">
        What the clinic emails, and to whom. Switch emails off while testing, or send them all to one inbox. Test accounts (addresses
        ending in example.test, example.com and similar) are never emailed, whatever is set here.
      </p>
      <EmailControlsEditor
        configured={emailConfigured()}
        controls={controls.status === "ok" ? controls.controls : null}
        kinds={EMAIL_KINDS.filter((k) => k.switchable).map((k) => ({ key: k.key, label: k.label, description: k.description, legal: k.legal }))}
        log={log.status === "ok" ? log.rows : null}
      />
    </div>
  );
}

async function loadEmailLog(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ status: "ok"; rows: EmailLogRow[] } | { status: "unreadable" }> {
  try {
    const { data, error } = await admin
      .from("email_log")
      .select("id, created_at, kind, recipient, subject, status, reason, redirected")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error?.code === "42P01" || error?.code === "PGRST205") return { status: "ok", rows: [] };
    if (error) return { status: "unreadable" };
    return {
      status: "ok",
      rows: (data ?? []).map((r) => ({
        id: String(r.id),
        createdAt: String(r.created_at),
        kind: String(r.kind),
        recipient: String(r.recipient),
        subject: String(r.subject),
        status: r.status as EmailLogRow["status"],
        reason: typeof r.reason === "string" ? r.reason : null,
        redirected: r.redirected === true,
      })),
    };
  } catch {
    return { status: "unreadable" };
  }
}
