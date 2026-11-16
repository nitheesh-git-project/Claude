// Data requests ("Delete my account", "Download my data") and grievances (the
// form on /grievances): the deadlines, the references, what a grievance may
// contain, and how a case reads on the admin queue. Dependency-free and
// unit-tested; the tables are in schema.sql ("Data requests and grievances").

export const DELETION_DEADLINE_DAYS = 30;
export const GRIEVANCE_ACK_HOURS = 48;
export const GRIEVANCE_RESOLVE_DAYS = 30;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const DATA_REQUEST_STATUSES = ["open", "in_progress", "completed", "rejected", "withdrawn"] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];

export const GRIEVANCE_STATUSES = ["new", "acknowledged", "resolved"] as const;
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

export const GRIEVANCE_CATEGORIES = ["service", "payment", "privacy", "therapist", "other"] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];

export const GRIEVANCE_CATEGORY_LABELS: Record<GrievanceCategory, string> = {
  service: "A session or the service",
  payment: "A payment or refund",
  privacy: "My personal data",
  therapist: "A therapist",
  other: "Something else",
};

export const DATA_REQUEST_STATUS_LABELS: Record<DataRequestStatus, string> = {
  open: "Received",
  in_progress: "Being worked on",
  completed: "Completed",
  rejected: "Declined",
  withdrawn: "Withdrawn",
};

export const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

export const DATA_REQUEST_ROLES = ["patient", "therapist", "hospital"] as const;
export type DataRequestRole = (typeof DATA_REQUEST_ROLES)[number];

export function isDataRequestRole(role: unknown): role is DataRequestRole {
  return typeof role === "string" && (DATA_REQUEST_ROLES as readonly string[]).includes(role);
}

// --- references --------------------------------------------------------

// No 0/O or 1/I: a reference is read out over the phone.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short code a person can quote: "GRV-7K3QXP". `random` is injectable for tests. */
export function makeReference(
  prefix: "GRV" | "DEL" | "EXP",
  random: () => number = Math.random
): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length) % REF_ALPHABET.length];
  return `${prefix}-${out}`;
}

// --- deadlines ---------------------------------------------------------

export type Due = {
  /** When this step must be done by. */
  dueAt: Date;
  /** Whole days left, rounded up; negative when overdue. */
  daysLeft: number;
  overdue: boolean;
  /** "Due in 3 days", "Due today", "2 days overdue", or hours under a day. */
  label: string;
};

function dueFrom(start: Date, ms: number, now: Date): Due {
  const dueAt = new Date(start.getTime() + ms);
  const left = dueAt.getTime() - now.getTime();
  const overdue = left < 0;
  const daysLeft = overdue ? -Math.ceil(-left / DAY_MS) : Math.ceil(left / DAY_MS);
  let label: string;
  if (overdue) {
    const d = Math.ceil(-left / DAY_MS);
    label = d <= 1 ? "Overdue" : `${d} days overdue`;
  } else if (left < DAY_MS) {
    const h = Math.max(1, Math.ceil(left / HOUR_MS));
    label = h === 1 ? "Due within the hour" : `Due in ${h} hours`;
  } else {
    label = daysLeft === 1 ? "Due in 1 day" : `Due in ${daysLeft} days`;
  }
  return { dueAt, daysLeft, overdue, label };
}

/** A deletion request's 30-day deadline, or null once it is closed. */
export function deletionDue(
  req: { created_at: string; status: DataRequestStatus },
  now: Date = new Date()
): Due | null {
  if (req.status !== "open" && req.status !== "in_progress") return null;
  return dueFrom(new Date(req.created_at), DELETION_DEADLINE_DAYS * DAY_MS, now);
}

/** The next deadline a grievance faces: acknowledgement, then resolution. */
export function grievanceDue(
  g: { created_at: string; status: GrievanceStatus },
  now: Date = new Date()
): (Due & { step: "acknowledge" | "resolve" }) | null {
  if (g.status === "resolved") return null;
  const created = new Date(g.created_at);
  if (g.status === "new") return { ...dueFrom(created, GRIEVANCE_ACK_HOURS * HOUR_MS, now), step: "acknowledge" };
  return { ...dueFrom(created, GRIEVANCE_RESOLVE_DAYS * DAY_MS, now), step: "resolve" };
}

/** Which moves are allowed from a status. Closed cases stay closed. */
export function allowedDataRequestMoves(status: DataRequestStatus): DataRequestStatus[] {
  if (status === "open") return ["in_progress", "completed", "rejected"];
  if (status === "in_progress") return ["completed", "rejected"];
  return [];
}

export function allowedGrievanceMoves(status: GrievanceStatus): GrievanceStatus[] {
  if (status === "new") return ["acknowledged", "resolved"];
  if (status === "acknowledged") return ["resolved"];
  return [];
}

/** A note is required to decline a request or to close a grievance. */
export function needsNote(to: DataRequestStatus | GrievanceStatus): boolean {
  return to === "rejected" || to === "resolved";
}

// --- what a grievance may contain ---------------------------------------

export const GRIEVANCE_LIMITS = {
  name: 120,
  email: 254,
  phone: 30,
  bookingReference: 60,
  messageMin: 10,
  message: 4000,
} as const;

export type GrievanceInput = {
  name: string;
  email: string;
  phone: string | null;
  category: GrievanceCategory;
  bookingReference: string | null;
  message: string;
  /** The honeypot: a real person never fills it. */
  spam: boolean;
};

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(CONTROL, "").trim() : "";
}

export function validateGrievance(
  body: unknown
): { ok: true; value: GrievanceInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "We couldn't read the form. Please try again." };
  const b = body as Record<string, unknown>;
  const name = clean(b.name).replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Please tell us your name." };
  if (name.length > GRIEVANCE_LIMITS.name) return { ok: false, error: "Your name is too long." };
  const email = clean(b.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > GRIEVANCE_LIMITS.email) {
    return { ok: false, error: "Please enter an email address we can reply to." };
  }
  const phone = clean(b.phone) || null;
  if (phone && (phone.length > GRIEVANCE_LIMITS.phone || !/^[+\d][\d\s()-]{5,}$/.test(phone))) {
    return { ok: false, error: "Please check the phone number, or leave it blank." };
  }
  const category = clean(b.category) as GrievanceCategory;
  if (!(GRIEVANCE_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: "Please choose what your complaint is about." };
  }
  const bookingReference = clean(b.bookingReference).replace(/\s+/g, " ") || null;
  if (bookingReference && bookingReference.length > GRIEVANCE_LIMITS.bookingReference) {
    return { ok: false, error: "The booking reference is too long." };
  }
  const message = clean(b.message);
  if (message.length < GRIEVANCE_LIMITS.messageMin) {
    return { ok: false, error: "Please tell us a little more about what happened." };
  }
  if (message.length > GRIEVANCE_LIMITS.message) {
    return { ok: false, error: `Please keep it under ${GRIEVANCE_LIMITS.message} characters.` };
  }
  const spam = typeof b.website === "string" && b.website.trim() !== "";
  return { ok: true, value: { name, email, phone, category, bookingReference, message, spam } };
}

export function validateDeletionReason(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "We couldn't read your reason." };
  const reason = clean(value);
  if (reason.length > 1000) return { ok: false, error: "Please keep your reason under 1000 characters." };
  return { ok: true, value: reason || null };
}
