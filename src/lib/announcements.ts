// Announcements: a banner an admin puts on top of the patient, therapist
// and hospital dashboards, with a pop-up behind it.
//
// This module is every judgement about one, in one dependency-free place:
// who it is for, whether it is on screen right now, what its button may
// lead to, and what a request body has to look like before a row is
// written. The routes, the dashboards and the admin screen all ask here, so
// "is this live?" cannot have three answers.
//
// Four decisions worth knowing before changing anything:
//
// 1. **Live is worked out from the clock, never stored.** A row carries when
//    it starts and when it ends; `announcementStatus()` reads those against
//    "now". Nothing has to run for an announcement to end -- it stops being
//    live the moment its end passes, on the next render, and the dashboard
//    re-checks once a minute so an open tab drops it too.
// 2. **A button leads to a screen that person can open, or to the web.**
//    The admin picks a destination per dashboard from the lists below, which
//    are the dashboards' own nav. A free-typed in-app path was the obvious
//    alternative and is refused on purpose: "/patient/dashboard/book" on a
//    therapist's banner is a redirect to /get-started, and a typo is a 404
//    behind a button that says "Book a session".
// 3. **Closing and "seen once" are per person, per announcement**, kept in
//    `announcement_receipts`. Editing an announcement does not bring a
//    closed one back; publishing a new one does, because it is a new row.
// 4. **The banner picture is optional.** Without one the banner is the
//    title on a brand strip -- so an urgent notice needs no artwork.

import { parseRichTextInput } from "@/lib/richText";

export const ANNOUNCEMENT_AUDIENCES = ["patient", "therapist", "hospital"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  patient: "Patients",
  therapist: "Therapists",
  hospital: "Hospitals",
};

export function isAnnouncementAudience(value: unknown): value is AnnouncementAudience {
  return ANNOUNCEMENT_AUDIENCES.includes(value as AnnouncementAudience);
}

export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_CTA_LABEL_MAX = 30;
/** Stored JSON characters. Roomier than a bio: a notice may carry a table. */
export const ANNOUNCEMENT_BODY_MAX = 40_000;
/** The longest an announcement may run. A banner nobody remembers posting
 *  is noise; a year is far past any real notice and stops a typo'd date
 *  (2062 for 2026) from living for ever. */
export const ANNOUNCEMENT_MAX_DAYS = 366;
/** The shortest, so "ends in 0 minutes" cannot be published. */
export const ANNOUNCEMENT_MIN_MINUTES = 5;
/** How many can be live for one dashboard at once. The carousel copes with
 *  more; a person does not. */
export const ANNOUNCEMENT_MAX_LIVE_PER_AUDIENCE = 8;

/** The banner is drawn at this shape everywhere. */
export const BANNER_ASPECT = { width: 6, height: 1 } as const;
/** The picture inside the pop-up. */
export const POPUP_ASPECT = { width: 4, height: 3 } as const;

export type AnnouncementDestination = { key: string; label: string; href: string };

/**
 * Where a button may lead, per dashboard. These are screens every account of
 * that role can open -- the conditional ones (a patient's Payments, which
 * exists only once they have paid for something) are left out, because a
 * button must work for everybody the banner is shown to.
 */
export const ANNOUNCEMENT_DESTINATIONS: Record<AnnouncementAudience, AnnouncementDestination[]> = {
  patient: [
    { key: "home", label: "Home", href: "/patient/dashboard" },
    { key: "book", label: "Book a session", href: "/patient/dashboard/book" },
    { key: "progress", label: "My progress", href: "/patient/dashboard/health-profile" },
    { key: "profile", label: "Edit profile", href: "/patient/dashboard/profile" },
  ],
  therapist: [
    { key: "home", label: "Overview", href: "/therapist/dashboard" },
    { key: "availability", label: "Availability", href: "/therapist/dashboard/availability" },
    { key: "sessions", label: "Sessions", href: "/therapist/dashboard/sessions" },
    { key: "earnings", label: "Earnings", href: "/therapist/dashboard/earnings" },
    { key: "patients", label: "My patients", href: "/therapist/dashboard/health-profile" },
    { key: "profile", label: "Edit profile", href: "/therapist/dashboard/profile" },
  ],
  hospital: [
    { key: "home", label: "Overview", href: "/hospital/dashboard" },
    { key: "refer", label: "Refer a patient", href: "/hospital/dashboard/refer" },
    { key: "referrals", label: "Your referrals", href: "/hospital/dashboard/referrals" },
    { key: "earnings", label: "Earnings", href: "/hospital/dashboard/revenue" },
    { key: "profile", label: "Edit profile", href: "/hospital/dashboard/profile" },
  ],
};

/** A web link a button may open: https only, no spaces or control
 *  characters. `http:` is refused -- the app is served over https and a
 *  mixed link is a browser warning behind the clinic's own button. */
export function safeWebLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const href = raw.trim();
  if (!href || href.length > 500) return null;
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(href)) return null;
  if (/\s/.test(href) || [...href].some((c) => c.charCodeAt(0) < 0x20)) return null;
  return href;
}

/** A stored picture address: ours to draw only if it is an https URL. */
export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url || url.length > 1000) return null;
  return /^https:\/\/\S+$/i.test(url) ? url : null;
}

/** What one dashboard's button does: a destination key, or a web link. */
export type CtaTarget = { kind: "screen"; key: string } | { kind: "web"; url: string };
export type CtaTargets = Partial<Record<AnnouncementAudience, CtaTarget>>;

function readCtaTarget(audience: AnnouncementAudience, raw: unknown): CtaTarget | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.kind === "screen") {
    const found = ANNOUNCEMENT_DESTINATIONS[audience].find((d) => d.key === record.key);
    return found ? { kind: "screen", key: found.key } : null;
  }
  if (record.kind === "web") {
    const url = safeWebLink(record.url);
    return url ? { kind: "web", url } : null;
  }
  return null;
}

/** The stored `cta_targets` column, made safe. Unknown keys and unreadable
 *  entries are dropped, never passed through. */
export function readCtaTargets(raw: unknown): CtaTargets {
  const out: CtaTargets = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const audience of ANNOUNCEMENT_AUDIENCES) {
    const target = readCtaTarget(audience, (raw as Record<string, unknown>)[audience]);
    if (target) out[audience] = target;
  }
  return out;
}

export type ResolvedCta = { label: string; href: string; external: boolean };

/** The button one dashboard shows, or null when there is none for it. */
export function resolveCta(
  label: string | null | undefined,
  targets: CtaTargets,
  audience: AnnouncementAudience
): ResolvedCta | null {
  const text = (label ?? "").trim();
  const target = targets[audience];
  if (!text || !target) return null;
  if (target.kind === "web") return { label: text, href: target.url, external: true };
  const destination = ANNOUNCEMENT_DESTINATIONS[audience].find((d) => d.key === target.key);
  return destination ? { label: text, href: destination.href, external: false } : null;
}

/** The row, as stored. */
export type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  banner_image_url: string | null;
  popup_image_url: string | null;
  audiences: string[];
  cta_label: string | null;
  cta_targets: unknown;
  published_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  dismissible: boolean;
  auto_open: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const ANNOUNCEMENT_SELECT =
  "id, title, body, banner_image_url, popup_image_url, audiences, cta_label, cta_targets, published_at, starts_at, ends_at, duration_minutes, dismissible, auto_open, sort_order, created_at, updated_at";

export type AnnouncementStatus = "draft" | "scheduled" | "live" | "ended";

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/** Draft until published; then scheduled, live or ended by the clock. A
 *  published row whose times cannot be read is `ended`, never live: an
 *  announcement we cannot date must not sit on a dashboard for ever. */
export function announcementStatus(
  row: Pick<AnnouncementRow, "published_at" | "starts_at" | "ends_at">,
  nowMs: number
): AnnouncementStatus {
  if (!row.published_at) return "draft";
  const start = ms(row.starts_at);
  const end = ms(row.ends_at);
  if (start === null || end === null) return "ended";
  if (nowMs >= end) return "ended";
  if (nowMs < start) return "scheduled";
  return "live";
}

export function isAnnouncementLive(
  row: Pick<AnnouncementRow, "published_at" | "starts_at" | "ends_at">,
  nowMs: number
): boolean {
  return announcementStatus(row, nowMs) === "live";
}

/** What a dashboard is handed: only what it draws, already resolved for the
 *  one role looking at it. */
export type DashboardAnnouncement = {
  id: string;
  title: string;
  body: string | null;
  bannerImageUrl: string | null;
  popupImageUrl: string | null;
  cta: ResolvedCta | null;
  endsAt: string;
  dismissible: boolean;
  /** Open the pop-up by itself: asked for, and this person has not seen it. */
  autoOpen: boolean;
};

export type AnnouncementReceipt = {
  announcement_id: string;
  dismissed_at: string | null;
  popup_seen_at: string | null;
};

/**
 * The announcements one person's dashboard shows, in order.
 *
 * Live, for their role, and not closed by them -- unless it cannot be
 * closed, in which case a receipt that says "dismissed" (written before the
 * admin unticked the box) is ignored: "everyone must keep seeing this" wins.
 */
export function announcementsForDashboard(
  rows: AnnouncementRow[],
  receipts: AnnouncementReceipt[],
  audience: AnnouncementAudience,
  nowMs: number
): DashboardAnnouncement[] {
  const receiptById = new Map(receipts.map((r) => [r.announcement_id, r]));
  return rows
    .filter((row) => isAnnouncementLive(row, nowMs) && row.audiences.includes(audience))
    .filter((row) => !(row.dismissible && receiptById.get(row.id)?.dismissed_at))
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        (ms(b.starts_at) ?? 0) - (ms(a.starts_at) ?? 0) ||
        a.id.localeCompare(b.id)
    )
    .slice(0, ANNOUNCEMENT_MAX_LIVE_PER_AUDIENCE)
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      bannerImageUrl: safeImageUrl(row.banner_image_url),
      popupImageUrl: safeImageUrl(row.popup_image_url),
      cta: resolveCta(row.cta_label, readCtaTargets(row.cta_targets), audience),
      endsAt: row.ends_at as string,
      dismissible: row.dismissible,
      autoOpen: row.auto_open && !receiptById.get(row.id)?.popup_seen_at,
    }));
}

/** Drops the ones whose end has passed since the page rendered. */
export function stillLive(list: DashboardAnnouncement[], nowMs: number): DashboardAnnouncement[] {
  return list.filter((a) => {
    const end = ms(a.endsAt);
    return end !== null && nowMs < end;
  });
}

export const DURATION_PRESETS = [
  { key: "24h", label: "24 hours", minutes: 24 * 60 },
  { key: "3d", label: "3 days", minutes: 3 * 24 * 60 },
  { key: "7d", label: "7 days", minutes: 7 * 24 * 60 },
] as const;

export type DurationUnit = "hours" | "days";

export function durationToMinutes(amount: number, unit: DurationUnit): number {
  return Math.round(amount * (unit === "days" ? 24 * 60 : 60));
}

/** "4 days", "20 hours", "45 minutes": how long is left, or how long it runs. */
export function describeMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes >= 48 * 60) return `${Math.round(minutes / (24 * 60))} days`;
  if (minutes >= 24 * 60) return "1 day";
  if (minutes >= 120) return `${Math.round(minutes / 60)} hours`;
  if (minutes >= 60) return "1 hour";
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** What the admin form posts. Times are ISO strings or null. */
export type AnnouncementInput = {
  title?: unknown;
  body?: unknown;
  bannerImageUrl?: unknown;
  popupImageUrl?: unknown;
  audiences?: unknown;
  ctaLabel?: unknown;
  ctaTargets?: unknown;
  /** Null: starts when it is published. */
  startsAt?: unknown;
  /** One of these two says when it ends; `endsAt` wins when both are sent. */
  endsAt?: unknown;
  durationMinutes?: unknown;
  dismissible?: unknown;
  autoOpen?: unknown;
  /** False saves a draft. */
  publish?: unknown;
};

export type AnnouncementWrite = {
  title: string;
  body: string | null;
  banner_image_url: string | null;
  popup_image_url: string | null;
  audiences: AnnouncementAudience[];
  cta_label: string | null;
  cta_targets: CtaTargets;
  published_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  dismissible: boolean;
  auto_open: boolean;
};

function readTime(raw: unknown): number | null | "bad" {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return "bad";
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : "bad";
}

/**
 * A request body as the row to write, or the sentence to show the admin.
 *
 * `alreadyPublishedAt` is the row's own `published_at` when this is an edit
 * of one that is already out: it keeps that time (an edit is not a new
 * publication) and may not be turned back into a draft, since people may
 * already have closed or seen it.
 */
export function parseAnnouncementInput(
  input: AnnouncementInput,
  nowMs: number,
  alreadyPublishedAt: string | null = null
): { ok: true; value: AnnouncementWrite } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "";
  if (!title) return { ok: false, error: "Give the announcement a title." };
  if (title.length > ANNOUNCEMENT_TITLE_MAX) {
    return { ok: false, error: `Keep the title to ${ANNOUNCEMENT_TITLE_MAX} characters or fewer.` };
  }

  const audiences = Array.isArray(input.audiences)
    ? ANNOUNCEMENT_AUDIENCES.filter((a) => (input.audiences as unknown[]).includes(a))
    : [];
  if (audiences.length === 0) {
    return { ok: false, error: "Choose at least one dashboard to show it on." };
  }

  const body = parseRichTextInput(input.body, {
    tables: true,
    maxLength: ANNOUNCEMENT_BODY_MAX,
    tooLong: "That is too long for a pop-up. Please shorten it.",
  });
  if (!body.ok) return { ok: false, error: body.error };

  const bannerRaw = input.bannerImageUrl ?? null;
  const banner = bannerRaw === null || bannerRaw === "" ? null : safeImageUrl(bannerRaw);
  if (bannerRaw !== null && bannerRaw !== "" && !banner) {
    return { ok: false, error: "The banner picture could not be read. Please upload it again." };
  }
  const popupRaw = input.popupImageUrl ?? null;
  const popup = popupRaw === null || popupRaw === "" ? null : safeImageUrl(popupRaw);
  if (popupRaw !== null && popupRaw !== "" && !popup) {
    return { ok: false, error: "The pop-up picture could not be read. Please upload it again." };
  }

  const ctaLabel = typeof input.ctaLabel === "string" ? input.ctaLabel.trim().replace(/\s+/g, " ") : "";
  if (ctaLabel.length > ANNOUNCEMENT_CTA_LABEL_MAX) {
    return { ok: false, error: `Keep the button text to ${ANNOUNCEMENT_CTA_LABEL_MAX} characters or fewer.` };
  }
  let ctaTargets: CtaTargets = {};
  if (ctaLabel) {
    const rawTargets =
      input.ctaTargets && typeof input.ctaTargets === "object" && !Array.isArray(input.ctaTargets)
        ? (input.ctaTargets as Record<string, unknown>)
        : {};
    for (const audience of audiences) {
      const target = readCtaTarget(audience, rawTargets[audience]);
      if (!target) {
        const sent = rawTargets[audience] as { kind?: unknown } | undefined;
        return {
          ok: false,
          error:
            sent?.kind === "web"
              ? `The web link for ${AUDIENCE_LABEL[audience]} must start with https://`
              : `Choose where the button takes ${AUDIENCE_LABEL[audience]}.`,
        };
      }
      ctaTargets[audience] = target;
    }
  } else {
    ctaTargets = {};
  }

  const publish = input.publish !== false;
  if (!publish && alreadyPublishedAt) {
    return { ok: false, error: "This announcement is already published. End it instead of saving it as a draft." };
  }

  const startRead = readTime(input.startsAt);
  const endRead = readTime(input.endsAt);
  if (startRead === "bad" || endRead === "bad") {
    return { ok: false, error: "That date and time could not be read. Please pick it again." };
  }
  const durationRaw = input.durationMinutes;
  const duration =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.round(durationRaw)
      : null;
  if (endRead === null && duration === null) {
    return { ok: false, error: "Say how long it stays, or when it ends." };
  }

  // When it starts: the chosen time, or -- "as soon as I publish" -- now for
  // a publication and nothing yet for a draft.
  const startMs = startRead ?? (publish ? nowMs : null);
  const endMs = endRead ?? (startMs !== null && duration !== null ? startMs + duration * 60_000 : null);

  const maxMinutes = ANNOUNCEMENT_MAX_DAYS * 24 * 60;
  if (duration !== null && endRead === null) {
    if (duration < ANNOUNCEMENT_MIN_MINUTES) {
      return { ok: false, error: `It must stay for at least ${ANNOUNCEMENT_MIN_MINUTES} minutes.` };
    }
    if (duration > maxMinutes) {
      return { ok: false, error: "An announcement can stay for at most one year." };
    }
  }
  if (startMs !== null && endMs !== null) {
    if (endMs <= startMs) return { ok: false, error: "It must end after it starts." };
    if (endMs - startMs < ANNOUNCEMENT_MIN_MINUTES * 60_000) {
      return { ok: false, error: `It must stay for at least ${ANNOUNCEMENT_MIN_MINUTES} minutes.` };
    }
    if (endMs - startMs > maxMinutes * 60_000) {
      return { ok: false, error: "An announcement can stay for at most one year." };
    }
  }
  if (publish && endMs !== null && endMs <= nowMs) {
    return { ok: false, error: "That end time has already passed." };
  }

  return {
    ok: true,
    value: {
      title,
      body: body.value,
      banner_image_url: banner,
      popup_image_url: popup,
      audiences,
      cta_label: ctaLabel || null,
      cta_targets: ctaTargets,
      published_at: publish ? alreadyPublishedAt ?? new Date(nowMs).toISOString() : null,
      starts_at: startMs === null ? null : new Date(startMs).toISOString(),
      ends_at: endMs === null ? null : new Date(endMs).toISOString(),
      duration_minutes: endRead === null ? duration : null,
      dismissible: input.dismissible !== false,
      auto_open: input.autoOpen === true,
    },
  };
}

/** The picture a row owns, by slot. The value is the file's name in storage. */
export const ANNOUNCEMENT_IMAGE_SLOTS = ["banner", "popup"] as const;
export type AnnouncementImageSlot = (typeof ANNOUNCEMENT_IMAGE_SLOTS)[number];

export function isAnnouncementImageSlot(value: unknown): value is AnnouncementImageSlot {
  return ANNOUNCEMENT_IMAGE_SLOTS.includes(value as AnnouncementImageSlot);
}

export const ANNOUNCEMENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AnnouncementImageType = (typeof ANNOUNCEMENT_IMAGE_TYPES)[number];

export function isAnnouncementImageType(value: unknown): value is AnnouncementImageType {
  return ANNOUNCEMENT_IMAGE_TYPES.includes(value as AnnouncementImageType);
}

/** 4 MB: a 1800 x 300 banner is a few hundred KB; this leaves room for a
 *  pop-up photograph off a phone and no more. */
export const ANNOUNCEMENT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const ANNOUNCEMENT_IMAGE_TOO_LARGE = "That picture is larger than 4 MB. Please use a smaller file.";
export const ANNOUNCEMENT_IMAGE_WRONG_TYPE = "Please upload a JPG, PNG or WebP picture.";

/** Where an upload is stored, inside the public `catalog-images` bucket.
 *  Keyed on a draft key the form mints (a row may not exist yet), so
 *  replacing a picture overwrites the old one rather than leaving it. */
export function announcementImagePath(
  draftKey: string,
  slot: AnnouncementImageSlot,
  contentType: AnnouncementImageType
): string {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `announcements/${draftKey}/${slot}.${ext}`;
}

// The clinic's clock, for the two date-and-time boxes on the admin form.
// A fixed +05:30 like every other form that takes a clinic time (the
// patient diary, the finance inputs): India has no daylight saving, and an
// admin typing "9:00 PM" means nine at the clinic wherever their laptop is.
const CLINIC_UTC_OFFSET = "+05:30";
const CLINIC_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** A `datetime-local` value ("2026-11-14T21:00"), read as clinic time. */
export function clinicInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = Date.parse(`${value}:00${CLINIC_UTC_OFFSET}`);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/** An instant as the `datetime-local` value showing clinic time. */
export function isoToClinicInput(iso: string | null | undefined): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "";
  return new Date(at + CLINIC_OFFSET_MS).toISOString().slice(0, 16);
}
