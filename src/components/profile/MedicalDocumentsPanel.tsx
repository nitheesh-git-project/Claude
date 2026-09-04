"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { compressImage } from "@/lib/compressImage";
import {
  DOCUMENT_FILE_ACCEPT,
  MAX_DOCUMENTS_PER_PATIENT,
  MAX_DOCUMENT_BYTES,
  MEDICAL_DOCUMENT_TYPES,
  MEDICAL_DOCUMENT_TYPE_LABEL,
  cleanDocumentTitle,
  formatFileSize,
  isAllowedDocumentMimeType,
  type MedicalDocumentRow,
  type MedicalDocumentType,
} from "@/lib/medicalDocuments";

// Icon per kind, so a chart of ten reports can be scanned by shape rather
// than read line by line.
const TYPE_ICON: Record<string, string> = {
  lab_report: "fa-vial",
  scan: "fa-x-ray",
  prescription: "fa-prescription",
  discharge_summary: "fa-file-medical",
  referral_letter: "fa-envelope-open-text",
  other: "fa-paperclip",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// A photographed report has to stay *readable*, unlike an avatar, so it
// keeps far more resolution than compressImage's defaults -- but a 12MP
// phone photo of an A4 sheet is still several times larger than it needs
// to be, and this is the difference between a patient's twenty reports
// costing 40MB and costing 200MB.
const PHOTO_COMPRESSION = {
  maxDimension: 2000,
  targetBytes: 1_200 * 1024,
  maxOriginalBytes: MAX_DOCUMENT_BYTES,
};

export default function MedicalDocumentsPanel({
  documents,
  canManage,
  emptyMessage,
}: {
  documents: MedicalDocumentRow[];
  /** Upload and delete are the patient's own; a therapist or admin reads. */
  canManage: boolean;
  emptyMessage: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ blob: Blob; name: string; mimeType: string } | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<MedicalDocumentType>("lab_report");
  const [takenOn, setTakenOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const atLimit = documents.length >= MAX_DOCUMENTS_PER_PATIENT;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file after a cancel
    if (!file) return;
    setError(null);

    const mimeType = (file.type || "").toLowerCase();
    if (!isAllowedDocumentMimeType(mimeType)) {
      setError("Upload a PDF or a photo (JPG, PNG, WEBP or HEIC).");
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(`That file is too large. The limit is ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.`);
      return;
    }

    try {
      // PDFs go up untouched (re-encoding one risks making it unreadable),
      // and HEIC is left alone because most browsers cannot decode it into
      // a canvas -- the server stores it as-is and the phone that took it
      // opens it fine.
      const compressible = mimeType.startsWith("image/") && !mimeType.includes("hei");
      const blob = compressible ? await compressImage(file, PHOTO_COMPRESSION) : file;
      setPending({
        blob,
        name: file.name,
        mimeType: compressible ? "image/jpeg" : mimeType,
      });
      setTitle(cleanDocumentTitle(file.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file. Please try another.");
    }
  }

  function cancelPending() {
    setPending(null);
    setTitle("");
    setTakenOn("");
    setError(null);
  }

  async function handleUpload() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      const extension = pending.mimeType === "image/jpeg" ? "jpg" : pending.name.split(".").pop() ?? "";
      form.append("file", new File([pending.blob], `report.${extension}`, { type: pending.mimeType }));
      form.append("title", title);
      form.append("documentType", documentType);
      if (takenOn) form.append("takenOn", takenOn);

      const response = await fetch("/api/patient/medical-documents/upload", {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Could not upload that report.");

      cancelPending();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that report.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(documentId: string) {
    setOpeningId(documentId);
    setError(null);
    try {
      const response = await fetch("/api/medical-documents/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Could not open that report.");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that report.");
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(documentId: string, documentTitle: string) {
    if (!window.confirm(`Delete "${documentTitle}"? Your therapist will no longer be able to see it.`)) {
      return;
    }
    setDeletingId(documentId);
    setError(null);
    try {
      const response = await fetch("/api/patient/medical-documents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Could not delete that report.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that report.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {documents.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <i aria-hidden className={`fa-solid ${TYPE_ICON[document.document_type] ?? TYPE_ICON.other} text-sm`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{document.title}</p>
                <p className="text-[11px] text-slate-500">
                  {MEDICAL_DOCUMENT_TYPE_LABEL[
                    document.document_type as MedicalDocumentType
                  ] ?? "Report"}
                  {" · "}
                  {document.taken_on
                    ? `taken ${formatDate(document.taken_on)}`
                    : `added ${formatDate(document.created_at)}`}
                  {" · "}
                  {formatFileSize(document.size_bytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpen(document.id)}
                disabled={openingId === document.id}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-50"
              >
                {openingId === document.id ? "Opening…" : "Open"}
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleDelete(document.id, document.title)}
                  disabled={deletingId === document.id}
                  aria-label={`Delete ${document.title}`}
                  className="shrink-0 rounded-lg border border-transparent px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                >
                  <i aria-hidden className="fa-solid fa-trash-can" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
      )}

      {canManage && (
        <div className="mt-4 print:hidden">
          {!pending ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={DOCUMENT_FILE_ACCEPT}
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={atLimit}
                className="w-full rounded-xl border border-dashed border-teal-300 bg-teal-50/60 px-4 py-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <i aria-hidden className="fa-solid fa-arrow-up-from-bracket mr-2" />
                Add a report
              </button>
              <p className="mt-2 text-[11px] text-slate-500">
                {atLimit
                  ? `You've reached ${MAX_DOCUMENTS_PER_PATIENT} reports. Delete one to add another.`
                  : `PDF or a photo, up to ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB. ${documents.length} of ${MAX_DOCUMENTS_PER_PATIENT} kept.`}
              </p>
            </>
          ) : (
            /* Details are asked *after* the file is chosen, never before:
               picking the file is the thing the patient came to do, and a
               form standing between them and it is what makes an upload
               feel like paperwork. */
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Ready to add</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{pending.name}</p>
              <p className="text-[11px] text-slate-500">{formatFileSize(pending.blob.size)}</p>

              <label className="mt-3 block text-xs font-semibold text-slate-600">
                What should we call it?
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 focus:border-teal-400 focus:outline-none"
                />
              </label>

              <p className="mt-3 text-xs font-semibold text-slate-600">What kind of report is it?</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {MEDICAL_DOCUMENT_TYPES.map((type) => (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => setDocumentType(type.key)}
                    title={type.hint}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      documentType === type.key
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <label className="mt-3 block text-xs font-semibold text-slate-600">
                When was it taken? <span className="font-normal text-slate-400">(optional)</span>
                <input
                  type="date"
                  value={takenOn}
                  onChange={(event) => setTakenOn(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 focus:border-teal-400 focus:outline-none"
                />
              </label>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={busy}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                >
                  {busy ? "Adding…" : "Add to my profile"}
                </button>
                <button
                  type="button"
                  onClick={cancelPending}
                  disabled={busy}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
