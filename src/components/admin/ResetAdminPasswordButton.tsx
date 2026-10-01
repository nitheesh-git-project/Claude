"use client";

import ResetSignInButton from "@/components/admin/ResetSignInButton";

// Re-issuing a back-office account's sign-in: a one-time link for them to
// set their own password -- see ResetSignInButton. Never yourself: the route
// refuses it too, and the honest lane for your own password is the emailed
// reset on Settings -> Sign-in & Security.
export default function ResetAdminPasswordButton({
  adminId,
  disabled = false,
  disabledReason,
}: {
  adminId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  if (disabled) {
    return (
      <span className="text-[11px] text-slate-500" title={disabledReason}>
        {disabledReason ?? "Not available for this account."}
      </span>
    );
  }
  return (
    <ResetSignInButton endpoint="/api/admin/reset-admin-password" body={{ adminId }} noun="admin" />
  );
}
