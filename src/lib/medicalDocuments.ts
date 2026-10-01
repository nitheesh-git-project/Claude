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

/**
 * The file's real type, read from its first bytes -- never the browser's
 * `File.type`, which is whatever the extension or the caller says it is. A
 * renamed executable arrives as `application/pdf` just as easily as a real
 * report does. Null when the bytes are none of the types this bucket holds.
 */
export function sniffDocumentMimeType(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i];
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...Array.from(bytes.subarray(from, to)));
  // PDF: "%PDF-" within the first 1KB (the spec tolerates leading junk).
  const head = ascii(0, Math.min(bytes.length, 1024));
  if (head.includes("%PDF-")) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // ISO-BMFF: "ftyp" at offset 4, then the major brand.
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return null;
}

// PDF features that run, launch or carry something other than the document
// itself. A lab report, a discharge summary or a scan has no use for any of
// them, and each is how a PDF becomes a delivery mechanism for whoever opens
// it -- which here is a clinician, on a work machine.
const PDF_ACTIVE_CONTENT = [
  "JavaScript",
  "JS",
  "Launch",
  "EmbeddedFile",
  "EmbeddedFiles",
  "RichMedia",
  "XFA",
  "SubmitForm",
  "ImportData",
  "GoToE",
];

/**
 * Whether a PDF carries scripts, launch actions or embedded files.
 *
 * Not a virus scanner, and it does not pretend to be one: names inside a
 * compressed object stream are not visible to it. It closes the plain cases
 * -- the ones a malicious "report" built with off-the-shelf tooling uses --
 * and is the structural check this deployment can make without an external
 * scanning service. PDF names may be hex-escaped (`/Java#53cript`), so those
 * are decoded before matching.
 */
export function pdfHasActiveContent(bytes: Uint8Array): boolean {
  let text = "";
  const CHUNK = 64 * 1024;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const decoded = text.replace(/\/([A-Za-z0-9#]+)/g, (_m, name: string) =>
    "/" + name.replace(/#([0-9A-Fa-f]{2})/g, (_h, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  );
  return PDF_ACTIVE_CONTENT.some((name) => new RegExp(`/${name}(?![A-Za-z0-9])`).test(decoded));
}

/** A patient's filename is never used as a storage path - it can carry
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
