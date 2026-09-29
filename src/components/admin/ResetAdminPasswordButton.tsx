"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";

// Re-issuing a back-office account's password. The fourth of these, and the
// one that did not exist: patients, therapists and hospitals could all have one
// re-issued from the back office, and an admin who had locked themselves out
// needed somebody with Supabase access.
//
// Unlike its three siblings it renders **no panel of its own**. On this screen
// the credential is already displayed by `IssuedPassword` on the same row,
// read from `admin_account_notes` on the server -- so a second copy here would
// be two places showing one password, and the moment they disagreed (a reset in
// another tab, a realtime refresh) the stale one would be the one somebody read
// out. The button asks, posts, and hands the display back to the row.
//
// It confirms first, the same as the other three: the current password stops
// working the instant this succeeds, and an admin who tapped it meaning to read
// the existing one has just locked somebody out.
export default function ResetAdminPasswordButton({
  adminId,
  disabled = false,
  disabledReason,
}: {
  adminId: string;
  /** Never yourself -- the route refuses it too. The honest lane for your own
   *  password is the emailed reset on Settings -> Sign-in & Security. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState(false);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleReset() {
    if (
      !(await confirm(
        "This will invalidate this back-office account's current password immediately, and they will need the new one to sign in. Continue?"
      ))
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    setIssued(false);
    try {
      const res = await fetch("/api/admin/reset-admin-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not reset password. Please try again.");
        return;
      }
      setIssued(true);
    } catch {
      setError("Could not reach the server. Please try again.");
      return;
    } finally {
      // Released before the refresh, which is the expensive half -- the teal
      // bar carries that, and a button that stayed disabled through a full
      // dashboard re-render reads as a hang.
      setLoading(false);
    }
    router.refresh();
  }

  if (disabled) {
    return (
      <span className="text-[11px] text-slate-500">{disabledReason ?? "Reset unavailable"}</span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleReset}
        disabled={loading}
        className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-300 disabled:opacity-60"
      >
        {loading ? "Resetting…" : "Reset password"}
      </button>
      {issued && !error && (
        <span className="text-[11px] font-semibold text-teal-700" role="status">
          New password issued - it is on this row above.
        </span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </span>
  );
}
