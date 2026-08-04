"use client";

// A small in-app Yes/No confirmation, for actions that shouldn't use the
// browser's own window.confirm() (inconsistent styling, blocks the render
// thread, can't be restyled/localized). Not the same component as
// admin/Modal.tsx -- that one is a large scrollable content panel; this is
// a compact two-button prompt.
export default function ConfirmDialog({
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  confirming = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            {confirming ? "Saving..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
