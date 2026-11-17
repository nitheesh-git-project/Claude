import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { deliverEmail } from "@/lib/emailServer";
import { testEmail } from "@/lib/legalEmails";
import { legalEmailContext } from "@/lib/legalEmailContext";
import { EMAIL_SKIP_TEXT } from "@/lib/emailControls";

// Settings -> Emails -> "Send me a test email". Sends one test email to the
// signed-in admin's OWN address (read from the session, never the body), so
// the button cannot be used to mail anyone else. It ignores the switches --
// it exists to check the setup while sending is off -- but never mails a
// test address (emailControls.ts, rule 1).
//
// Request:  {} (any body is ignored, but must parse)
// Response: 200 { result: "sent" | "skipped" | "failed", reason, message }
//           400 malformed body, 403 scope, 409 no email on this account.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  if (!adminUser.email) {
    return NextResponse.json({ error: "Your account has no email address to send the test to." }, { status: 409 });
  }

  const { brand } = await legalEmailContext(request);
  const outcome = await deliverEmail(adminUser.email, testEmail(brand), { kind: "test" });
  const message =
    outcome.result === "sent"
      ? `Sent to ${adminUser.email}. Check your inbox, and your spam folder.`
      : outcome.result === "failed"
        ? "The email service refused it. Check the sending domain and key in Resend, then try again."
        : `Not sent: ${EMAIL_SKIP_TEXT[outcome.reason ?? "not_configured"]}.`;

  await recordAdminActivity(createAdminClient(), adminUser.id, {
    action: "email.test_send",
    targetLabel: "Test email",
    details: { result: outcome.result, reason: outcome.reason },
  });
  return NextResponse.json({ result: outcome.result, reason: outcome.reason, message });
}
