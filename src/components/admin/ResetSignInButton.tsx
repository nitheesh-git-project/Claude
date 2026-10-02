"use client";

import { useState } from "react";
import { useConfirm } from "@/lib/useConfirm";
import SignInLinkResult from "@/components/admin/SignInLinkResult";

/**
 * "Reset sign-in" for any account an admin manages: locks out the current
 * password and issues a one-time link for the person to set their own.
 *
 * Replaces four near-identical buttons that each generated a password and
 * kept it on screen (and in the database) for up to fourteen days. The link
 * is held in this component only; once the admin closes it, it is gone, and
 * pressing the button again issues a fresh one.
 */
export default function ResetSignInButton({
  endpoint,
  body,
  noun,
}: {
  endpoint: string;
  body: Record<string, string>;
  /** "patient", "therapist", "partner", "admin" -- for the confirmation. */
  noun: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string | null; linkPath: string } | null>(null);
  const { confirm, dialog } = useConfirm();

  async function handleReset() {
    if (
      !(await confirm(
        `This signs the ${noun} out of their current password straight away and gives you a one-time link for them to set a new one. Continue?`
      ))
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.linkPath) {
        setError(data.error ?? "Could not issue a sign-in link. Please try again.");
        return;
      }
      setResult({ email: data.email ?? null, linkPath: data.linkPath });
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 w-full">
      {result ? (
        <SignInLinkResult email={result.email} linkPath={result.linkPath} onDismiss={() => setResult(null)} />
      ) : (
        <button
          onClick={handleReset}
          disabled={loading}
          className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          {loading ? "Issuing link..." : "Reset password (send sign-in link)"}
        </button>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
