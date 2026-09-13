"use client";

import { useCallback } from "react";
import { useToast } from "@/lib/toast";
import { settingSavedMessage } from "@/lib/settingMessages";

/**
 * Saving one admin setting, and saying what changed.
 *
 * This helper existed already -- eight times, copy-pasted into every
 * settings surface, each a few lines doing exactly the same POST. That was
 * survivable while it only made a request; it stopped being survivable the
 * moment saving needed to *say* something, because a confirmation added to
 * one copy is a confirmation seven screens do not get.
 *
 * The toast is raised here rather than at each call site so the wording
 * comes from `settingMessages.ts` -- one vocabulary for the whole Settings
 * section, in the owner's words rather than the column's.
 *
 * A failure raises an error toast **and rethrows**, because the callers
 * already roll their optimistic switch back on a throw. Swallowing it here
 * would leave a toggle showing a value the server refused.
 */
export function useSaveSetting() {
  const { show } = useToast();

  return useCallback(
    // `null` is a value, not a missing argument: the two break-even
    // overrides use it to mean "go back to working it out from my own
    // sessions", which is the only way back from a figure typed in once.
    async (key: string, value: boolean | number | string | string[] | null) => {
      try {
        const res = await fetch("/api/admin/update-setting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
        show(settingSavedMessage(key, value));
      } catch (error) {
        // A request that dies on a bad connection has to say so too. Left to
        // the caller's own error line, it lands in whatever small red text
        // that screen happens to have -- and several have none.
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Could not reach the server. Nothing was saved.";
        show(message, "error");
        throw error;
      }
    },
    [show]
  );
}
