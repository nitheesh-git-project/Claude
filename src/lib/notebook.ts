// The notebook: a private diary every patient, therapist and hospital
// account carries on its dashboard.
//
// It is the person's own scratch space -- what the pain felt like, what to
// ask next time, a number to remember -- and deliberately NOT a clinical
// record. Three things follow from that, and they are the reason this is
// its own table and module rather than a use of something that exists:
//
// 1. **Nobody else reads it.** Not the therapist, not the hospital, not an
//    admin screen: there is no policy, route or page that shows one person's
//    pages to another, and the routes refuse an admin who is signed in as
//    that person (see /api/notebook). The patient diary
//    (`patient_diary_entries`) is the opposite on every count -- structured,
//    append-only, read by the treating therapist -- so the two are kept
//    apart by name and by table.
// 2. **Pages are edited and deleted freely.** It is a notebook, not
//    evidence: no append-only guard, and deleting the account takes the
//    pages with it.
// 3. **A page is formatted text**, the same document `src/lib/richText.ts`
//    sanitises everywhere else, with tables allowed.
//
// Dependency-free, like every other judgement in `src/lib`.

import { parseRichText, parseRichTextInput, richTextToPlain } from "@/lib/richText";

/** Stored JSON characters for one page. A page is a page: several screens
 *  of writing, not a document store. */
export const NOTEBOOK_PAGE_MAX = 30_000;
/** Pages one person may keep. Far past real use; it exists so a script
 *  holding a session cannot fill the table. */
export const NOTEBOOK_MAX_PAGES = 500;
/** How long the notebook waits after the last keystroke before saving. */
export const NOTEBOOK_AUTOSAVE_MS = 900;

export type NotebookPageRow = {
  id: string;
  body: string | null;
  created_at: string;
  updated_at: string;
};

export const NOTEBOOK_PAGE_SELECT = "id, body, created_at, updated_at";

/** A request body's `content` (the editor's JSON) as the value to store. */
export function parseNotebookPageInput(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  return parseRichTextInput(raw, {
    tables: true,
    maxLength: NOTEBOOK_PAGE_MAX,
    tooLong: "This page is full. Start a new page to keep writing.",
  });
}

/** The first words of a page, for the list of pages. Empty when the page
 *  says nothing yet. */
export function notebookPagePreview(body: string | null, max = 70): string {
  const text = richTextToPlain(parseRichText(body, { tables: true })).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Pages in the order they are numbered: oldest first, so page 1 stays
 *  page 1 for ever and "new page" is always the last one. */
export function orderNotebookPages<T extends Pick<NotebookPageRow, "id" | "created_at">>(pages: T[]): T[] {
  return [...pages].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)
  );
}

/** Who may have a notebook. Admins have the back office, not a diary. */
export const NOTEBOOK_ROLES = ["patient", "therapist", "hospital"] as const;
export type NotebookRole = (typeof NOTEBOOK_ROLES)[number];

export function isNotebookRole(value: unknown): value is NotebookRole {
  return NOTEBOOK_ROLES.includes(value as NotebookRole);
}
