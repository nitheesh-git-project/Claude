// Logs -> Signed in as: every time an admin opened somebody's dashboard as
// them, with the reason they typed, how long it lasted and what they changed
// while inside.
//
// The record already existed in two places -- `admin_impersonation_sessions`
// (who, whom, reason, start, end) and the `impersonation.action` rows the
// proxy writes into the activity log for each change made during a window
// (impersonationAudit.ts) -- but the only way to read it was as single lines
// scattered through All Activity. This module joins the two and filters
// them; the screen is AdminImpersonationLog.
//
// Dependency-free, like every other judgement in src/lib.

export type ImpersonationSessionRow = {
  id: string;
  admin_id: string;
  target_id: string | null;
  target_role: string;
  reason: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  ended_reason: string | null;
};

export type ImpersonationActionRow = {
  created_at: string;
  details: unknown;
};

export type ImpersonationStatus = "open" | "ended" | "expired";

export type ImpersonationLogEntry = {
  id: string;
  adminId: string;
  adminName: string;
  targetId: string | null;
  targetName: string;
  targetRole: "patient" | "therapist" | "hospital";
  reason: string;
  startedAt: string;
  /** When it actually stopped: the exit, or the expiry for one never exited. */
  endedAt: string | null;
  status: ImpersonationStatus;
  /** Whole minutes, or null while it is still open. */
  minutes: number | null;
  actions: { at: string; method: string; path: string }[];
};

export const IMPERSONATION_SELECT =
  "id, admin_id, target_id, target_role, reason, started_at, expires_at, ended_at, ended_reason";

function roleOf(value: string): ImpersonationLogEntry["targetRole"] {
  return value === "therapist" || value === "hospital" ? value : "patient";
}

/** "open" until it is exited or its window passes. A window nobody exited
 *  is "expired" and ends at its expiry -- the proxy signed it out then. */
export function impersonationStatus(row: ImpersonationSessionRow, nowMs: number): ImpersonationStatus {
  if (row.ended_at) return row.ended_reason === "expired" ? "expired" : "ended";
  return Date.parse(row.expires_at) <= nowMs ? "expired" : "open";
}

function sessionIdOf(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const id = (details as Record<string, unknown>).sessionId;
  return typeof id === "string" ? id : null;
}

function str(details: unknown, key: string): string {
  if (!details || typeof details !== "object") return "";
  const v = (details as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

export function buildImpersonationLog(
  sessions: ImpersonationSessionRow[],
  actions: ImpersonationActionRow[],
  names: Map<string, string>,
  nowMs: number
): ImpersonationLogEntry[] {
  const bySession = new Map<string, ImpersonationLogEntry["actions"]>();
  for (const a of actions) {
    const id = sessionIdOf(a.details);
    if (!id) continue;
    const list = bySession.get(id) ?? [];
    list.push({ at: a.created_at, method: str(a.details, "method"), path: str(a.details, "path") });
    bySession.set(id, list);
  }
  return [...sessions]
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || a.id.localeCompare(b.id))
    .map((row) => {
      const status = impersonationStatus(row, nowMs);
      const endedAt = row.ended_at ?? (status === "expired" ? row.expires_at : null);
      const minutes =
        endedAt === null ? null : Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(row.started_at)) / 60_000));
      return {
        id: row.id,
        adminId: row.admin_id,
        adminName: names.get(row.admin_id) ?? "A former admin",
        targetId: row.target_id,
        targetName: row.target_id ? names.get(row.target_id) ?? "Unknown account" : "A deleted account",
        targetRole: roleOf(row.target_role),
        reason: row.reason,
        startedAt: row.started_at,
        endedAt,
        status,
        minutes,
        actions: (bySession.get(row.id) ?? []).sort((a, b) => a.at.localeCompare(b.at)),
      };
    });
}

export type ImpersonationFilters = {
  adminId: string;
  role: "" | "patient" | "therapist" | "hospital";
  /** Matches the person's name or the reason, case-insensitively. */
  query: string;
  /** Clinic-day keys, inclusive: "2026-11-01". Empty for no bound. */
  from: string;
  to: string;
  onlyWithChanges: boolean;
};

export const EMPTY_IMPERSONATION_FILTERS: ImpersonationFilters = {
  adminId: "",
  role: "",
  query: "",
  from: "",
  to: "",
  onlyWithChanges: false,
};

/** The clinic's day an instant falls on (IST, a fixed +05:30). */
export function clinicDayKey(iso: string): string {
  return new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function filterImpersonationLog(
  entries: ImpersonationLogEntry[],
  f: ImpersonationFilters
): ImpersonationLogEntry[] {
  const q = f.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.adminId && e.adminId !== f.adminId) return false;
    if (f.role && e.targetRole !== f.role) return false;
    if (f.onlyWithChanges && e.actions.length === 0) return false;
    const day = clinicDayKey(e.startedAt);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (q && !e.targetName.toLowerCase().includes(q) && !e.reason.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** A change made inside the window, as a sentence: the route says what it
 *  was ("/api/patient/addresses" -> "patient addresses"). */
export function describeImpersonatedAction(path: string, method: string): string {
  const words = path
    .replace(/^\/api\//, "")
    .split("/")
    .filter((part) => part && !/^[0-9a-f-]{20,}$/i.test(part))
    .join(" ")
    .replace(/[-_]/g, " ")
    .trim();
  const verb = method === "DELETE" ? "Deleted" : method === "PATCH" || method === "PUT" ? "Updated" : "Sent";
  return words ? `${verb}: ${words}` : verb;
}
