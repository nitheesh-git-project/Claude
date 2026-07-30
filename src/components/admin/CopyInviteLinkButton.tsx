"use client";

import { useState } from "react";

export default function CopyInviteLinkButton({
  inviteToken,
}: {
  inviteToken: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const link = `${window.location.origin}/patient/register?ref=${inviteToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-[11px] text-teal-700 font-semibold hover:underline"
    >
      {copied ? "Copied!" : "Copy Invite Link"}
    </button>
  );
}
