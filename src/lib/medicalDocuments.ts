// Shared rules for patient-uploaded test reports and scans. The limits
// live here rather than in the upload route so the browser can refuse a
// file before spending a minute uploading it, and the route can refuse the
// same file again without the two drifting apart.

export type MedicalDocumentType =
  | "lab_report"
  | "scan"
  | "prescription"
  | "discharge_summary"
  | "referral_letter"
  | "other";

export type MedicalDocumentTypeDef = {
  key: MedicalDocumentType;
  label: string;
  /** What a patient would call it, so the picker isn't clinic jargon. */
  hint: string;
};

export const MEDICAL_DOCUMENT_TYPES: MedicalDocumentTypeDef[] = [
  { key: "lab_report", label: "Lab report", hint: "Blood test, urine test" },
  { key: "scan", label: "Scan or X-ray", hint: "X-ray, MRI, CT, ultrasound" },
  { key: "prescription", label: "Prescription", hint: "Medicines a doctor prescribed" },
  { key: "discharge_summary", label: "Hospital summary", hint: "Discharge or surgery notes" },
  { key: "referral_letter", label: "Referral letter", hint: "A letter from another doctor" },
  { key: "other", label: "Something else", hint: "Anything not listed above" },
];

export const MEDICAL_DOCUMENT_TYPE_LABEL: Record<MedicalDocumentType, string> = Object.fromEntries(
  MEDICAL_DOCUMENT_TYPES.map((t) => [t.key, t.label])
) as Record<MedicalDocumentType, string>;

export function isMedicalDocumentType(value: string): value is MedicalDocumentType {
  return MEDICAL_DOCUMENT_TYPES.some((t) => t.key === value);
}

// A per-file cap and a per-patient count cap, because either one alone
// leaves storage unbounded: 10MB with no count limit is an unlimited
// bucket one upload at a time. Together they cap a patient at 200MB, which
// is a realistic ceiling for a course of treatment and a knowable cost.
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_PATIENT = 20;

// Photographs of a report are the common case (people photograph paper
// rather than scan it), so images are re-compressed in the browser before
// upload. PDFs go up as-is: re-encoding one would risk making it
// unreadable, and a report PDF is small to begin with.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export const DOCUMENT_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType.toLowerCase());
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function documentExtension(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? "bin";
}

/** A patient's filename is never used as a storage path — it can carry
 *  slashes, unicode, or another patient's id. It is kept only as the
 *  display title, trimmed to something a list can render. */
export function cleanDocumentTitle(raw: string): string {
  const withoutExtension = raw.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const cleaned = withoutExtension.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "Untitled report";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type MedicalDocumentRow = {
  id: string;
  title: string;
  document_type: string;
  taken_on: string | null;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};
