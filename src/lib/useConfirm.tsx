"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

// Drop-in async replacement for `if (!window.confirm(msg)) return;` --
// `if (!(await confirm(msg))) return;` reads almost identically at the call
// site, but renders the app's own ConfirmDialog instead of the browser's
// unstyled, render-blocking native prompt. Render `dialog` once, anywhere,
// in the component using this hook.
// Labels are optional: "Yes" / "No" by default, or words naming the two
// outcomes ("Discard" / "Keep editing") where a bare yes/no would be ambiguous.
type ConfirmLabels = { confirmLabel?: string; cancelLabel?: string };

export function useConfirm(): {
  confirm: (message: string, labels?: ConfirmLabels) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [message, setMessage] = useState<string | null>(null);
  const [labels, setLabels] = useState<ConfirmLabels>({});
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((msg: string, nextLabels?: ConfirmLabels) => {
    setLabels(nextLabels ?? {});
    setMessage(msg);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function handleConfirm() {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setMessage(null);
  }

  function handleCancel() {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setMessage(null);
  }

  const dialog =
    message !== null ? (
      <ConfirmDialog
        message={message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        {...(labels.confirmLabel ? { confirmLabel: labels.confirmLabel } : {})}
        {...(labels.cancelLabel ? { cancelLabel: labels.cancelLabel } : {})}
      />
    ) : null;

  return { confirm, dialog };
}
