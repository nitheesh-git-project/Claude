"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import PromptDialog from "@/components/PromptDialog";

// Drop-in async replacement for `const x = window.prompt(msg); if (x ===
// null) return;` -- `const x = await prompt(msg); if (x === null) return;`
// reads almost identically at the call site, but renders the app's own
// PromptDialog instead of the browser's unstyled, render-blocking native
// prompt. Render `dialog` once, anywhere, in the component using this hook.
export function usePrompt(): {
  prompt: (message: string, defaultValue?: string, placeholder?: string) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [state, setState] = useState<{ message: string; defaultValue: string; placeholder?: string } | null>(
    null
  );
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const prompt = useCallback((message: string, defaultValue = "", placeholder?: string) => {
    setState({ message, defaultValue, placeholder });
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function handleSubmit(value: string) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState(null);
  }

  function handleCancel() {
    resolverRef.current?.(null);
    resolverRef.current = null;
    setState(null);
  }

  const dialog = state ? (
    <PromptDialog
      message={state.message}
      defaultValue={state.defaultValue}
      placeholder={state.placeholder}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  ) : null;

  return { prompt, dialog };
}
