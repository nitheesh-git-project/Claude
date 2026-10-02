import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageHealth } from "@/lib/systemHealth";
import { readAllRows } from "@/lib/supabase/readAllRows";

/**
 * Patient files against the rows that describe them.
 *
 * `patient_medical_documents` holds metadata only -- the file itself is a
 * Storage object in the private `medical-reports` bucket -- so the two can
 * come apart in either direction and nothing looked:
 *
 * - **A file with no row.** The upload route deletes the object when its own
 *   insert fails, so this is the *delete* half: a row removed in Postgres
 *   whose Storage delete then failed leaves the file behind. It is a scan
 *   report the patient believes they have removed, still sitting in a
 *   bucket.
 * - **A row with no file.** The reverse, and the worse one to meet: the
 *   document is listed on the patient's own health profile, and the view
 *   route mints a signed URL for something that is not there.
 *
 * **It lists and never deletes**, which is the rule `docs/DATA-POLICY.md` §5
 * states and the reason this is a health check rather than a sweep: a sweep
 * that removes a file because it could not find a row is one bad query away
 * from deleting a patient's scan. Every other reconciliation on that screen
 * reports rather than repairs for the same reason, and this is the one where
 * the cost of being wrong is a medical record rather than a number.
 *
 * Returns null when it could not be asked -- a read that failed is not a read
 * that came back clean, and on this screen a zero would be read as "nothing
 * to worry about" rather than "we did not look".
 */
export const MEDICAL_REPORTS_BUCKET = "medical-reports";

/**
 * How many objects to walk. Storage lists per folder, and this bucket is one
 * folder per patient, so the bound is on **patients** rather than files --
 * which is the number that actually grows here, since each patient is capped
 * at 20 files by `medicalDocuments.ts`.
 *
 * A cap at all, because this runs inside the admin dashboard's render: past
 * it the check says it only looked at part of the bucket rather than
 * reporting a clean result it did not earn.
 */
const MAX_PATIENT_FOLDERS = 200;

export async function readStorageReconciliation(
  admin: SupabaseClient
): Promise<StorageHealth | null> {
  try {
    // Paged: a plain select stops at PostgREST's max_rows (1,000), and every
    // row past it would read as "file with no row" -- a false fault -- while
    // every missing file past it went unreported.
    const { rows, error, truncated: rowsTruncated } = await readAllRows<{
      id: string;
      patient_id: string;
      storage_path: string | null;
    }>(() =>
      admin
        .from("patient_medical_documents")
        .select("id, patient_id, storage_path")
        .order("id", { ascending: true })
    );
    if (error || rowsTruncated) return null;

    const recorded = new Set(
      (rows ?? [])
        .map((r) => (r.storage_path as string | null) ?? null)
        .filter((p): p is string => !!p)
    );

    // One folder per patient. Listing the bucket root gives the folders; each
    // folder is then listed for its own files. A patient with rows but no
    // folder is covered by the row-side comparison below, so the root listing
    // does not need to be exhaustive for that half to be right.
    const { data: folders, error: rootError } = await admin.storage
      .from(MEDICAL_REPORTS_BUCKET)
      .list("", { limit: MAX_PATIENT_FOLDERS });
    if (rootError) return null;

    const folderNames = (folders ?? [])
      .map((f) => f.name)
      .filter((name): name is string => !!name);
    const truncated = folderNames.length >= MAX_PATIENT_FOLDERS;

    const storedPaths = new Set<string>();
    for (const folder of folderNames) {
      const { data: files, error: listError } = await admin.storage
        .from(MEDICAL_REPORTS_BUCKET)
        .list(folder, { limit: 100 });
      // One unreadable folder is not a clean bucket. Reporting what was found
      // so far would understate both counts, which on this check reads as
      // "nothing is wrong".
      if (listError) return null;
      for (const file of files ?? []) {
        if (file.name) storedPaths.add(`${folder}/${file.name}`);
      }
    }

    let filesWithNoRow = 0;
    for (const path of storedPaths) {
      if (!recorded.has(path)) filesWithNoRow += 1;
    }

    let rowsWithNoFile = 0;
    for (const path of recorded) {
      // Only judged against folders that were actually listed. A row whose
      // patient folder fell outside the cap is unknown rather than missing,
      // and counting it would invent a fault.
      const folder = path.split("/")[0];
      if (!folder || !folderNames.includes(folder)) continue;
      if (!storedPaths.has(path)) rowsWithNoFile += 1;
    }

    return { filesWithNoRow, rowsWithNoFile, truncated };
  } catch {
    return null;
  }
}
