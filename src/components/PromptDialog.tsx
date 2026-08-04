"use client";

import { useState } from "react";

// In-app replacement for window.prompt() -- same rationale as
// ConfirmDialog.tsx (inconsistent native styling, blocks the render thread,
// can't be restyled/localized). Returns the typed text on submit, or lets
// the caller treat a cancel the same way window.prompt's null return does.
export default function PromptDialog({
  message,
  defaultValue = "",
  placeholder,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  submitting = false,
  onSubmit,
  onCancel,
}: {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-slate-700 leading-relaxed">{message}</p>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full mt-3 p-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onSubmit(value)}
            disabled={submitting}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            {submitting ? "Saving..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
