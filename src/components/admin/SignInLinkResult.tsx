"use client";

import { useState } from "react";

/**
 * The one-time sign-in link an admin hands over in place of a password.
 *
 * Shown once, here, and never stored: the person opens it, sets their own
 * password, and the link is spent. If it is lost, the admin issues another
 * -- nothing about the account depends on this screen staying open.
 */
export default function SignInLinkResult({
  email,
  linkPath,
  onDismiss,
}: {
  email?: string | null;
  linkPath: string;
  onDismiss?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Only ever rendered after a click, so the browser's own origin is there to
  // read -- the address the person should open is the one the admin is on.
  const link = typeof window === "undefined" ? linkPath : `${window.location.origin}${linkPath}`;

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs space-y-1.5">
      <p className="font-bold text-teal-900">
        One-time sign-in link{email ? ` for ${email}` : ""}
      </p>
      <p className="text-teal-800">
        Send this to them directly. It lets them set their own password, works once, and
        expires after a short time. We don&apos;t keep a copy - if it&apos;s lost, issue a new one.
      </p>
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="One-time sign-in link"
        className="w-full font-mono text-[11px] bg-white border border-teal-200 rounded-lg px-2 py-1.5"
      />
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false));
          }}
          className="bg-teal-700 hover:bg-teal-800 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
