import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { deliverEmail, loadEmailControls } from "@/lib/emailServer";
import { testEmail } from "@/lib/legalEmails";
import { legalEmailContext } from "@/lib/legalEmailContext";
import { EMAIL_SKIP_TEXT } from "@/lib/emailControls";

// Settings -> Emails -> "Send me a test email". Sends one test email to the
// TEST INBOX when test mode is on (the address an admin typed on this very
// screen, so it is theirs to read), otherwise to the signed-in admin's OWN
// address (read from the session). Never an address from the body, so the
// button cannot be used to mail anyone else. Test mode first because the
// admin account's address on a staging project can be one nobody reads (or a
// real domain that is not the clinic's: a test email once went to
// admin@test.com). It ignores the switches -- it exists to check the setup
// while sending is off -- but never mails a test address (emailControls.ts,
// rule 1).
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
  const controls = await loadEmailControls(createAdminClient());
  const testInbox = controls.status === "ok" ? controls.controls.testInbox : null;
  const to = testInbox ?? adminUser.email;
  const outcome = await deliverEmail(to, testEmail(brand), { kind: "test" });
  const message =
    outcome.result === "sent"
      ? `Sent to ${to}${testInbox ? " (your test inbox)" : ""}. Check your inbox, and your spam folder.`
      : outcome.result === "failed"
        ? "The email service refused it. Check the sending domain and key in Resend, then try again."
        : `Not sent: ${EMAIL_SKIP_TEXT[outcome.reason ?? "not_configured"]}.`;

  await recordAdminActivity(createAdminClient(), adminUser.id, {
    action: "email.test_send",
    targetLabel: "Test email",
    details: { result: outcome.result, reason: outcome.reason, toTestInbox: !!testInbox },
  });
  return NextResponse.json({ result: outcome.result, reason: outcome.reason, message });
}
