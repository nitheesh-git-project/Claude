"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/useConfirm";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import RichTextEditor from "@/components/RichTextEditor";
import DateField from "@/components/system/DateField";
import AnnouncementDialog from "@/components/dashboard/extras/AnnouncementDialog";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { parseRichText, sanitizeRichDoc, serializeRichText, toEditorJson } from "@/lib/richText";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_CTA_LABEL_MAX,
  ANNOUNCEMENT_DESTINATIONS,
  ANNOUNCEMENT_IMAGE_MAX_BYTES,
  ANNOUNCEMENT_IMAGE_TOO_LARGE,
  ANNOUNCEMENT_IMAGE_TYPES,
  ANNOUNCEMENT_IMAGE_WRONG_TYPE,
  ANNOUNCEMENT_TITLE_MAX,
  AUDIENCE_LABEL,
  BANNER_ASPECT,
  DURATION_PRESETS,
  POPUP_ASPECT,
  announcementStatus,
  clinicInputToIso,
  describeMinutes,
  durationToMinutes,
  isAnnouncementImageType,
  isoToClinicInput,
  readCtaTargets,
  resolveCta,
  safeImageUrl,
  type AnnouncementAudience,
  type AnnouncementImageSlot,
  type AnnouncementRow,
  type AnnouncementStatus,
  type CtaTarget,
  type DashboardAnnouncement,
  type DurationUnit,
} from "@/lib/announcements";

/**
 * Settings -> Announcements: the list, and the form.
 *
 * One screen, two states. The list answers "what is on people's dashboards
 * right now, and what is coming"; the form builds one announcement with a
 * live preview beside it, so the admin sees the banner, the one-line strip
 * and the real pop-up before anybody else does.
 *
 * Every rule about what may be saved lives in src/lib/announcements.ts and
 * is enforced by the route. This form only helps: it offers the three
 * durations people actually use, shows when the announcement will end in
 * the clinic's time, and crops a picture to the banner's shape before it is
 * uploaded -- which is what "it always fits the dashboard" is made of.
 */

type StayMode = "24h" | "3d" | "7d" | "custom" | "until";
type TargetDraft = { mode: "screen" | "web"; key: string; url: string };

type Draft = {
  id: string | null;
  draftKey: string;
  alreadyPublished: boolean;
  title: string;
  audiences: AnnouncementAudience[];
  bannerUrl: string | null;
  popupUrl: string | null;
  bodyStored: string | null;
  ctaLabel: string;
  targets: Record<AnnouncementAudience, TargetDraft>;
  startMode: "now" | "at";
  startsAt: string;
  stayMode: StayMode;
  customAmount: string;
  customUnit: DurationUnit;
  endsAt: string;
  dismissible: boolean;
  autoOpen: boolean;
};

const STATUS_STYLE: Record<AnnouncementStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-emerald-100 text-emerald-800" },
  scheduled: { label: "Scheduled", className: "bg-indigo-100 text-indigo-800" },
  draft: { label: "Draft", className: "bg-amber-100 text-amber-800" },
  ended: { label: "Ended", className: "bg-slate-100 text-slate-700" },
};

function newKey(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function emptyTargets(): Record<AnnouncementAudience, TargetDraft> {
  return {
    patient: { mode: "screen", key: "book", url: "" },
    therapist: { mode: "screen", key: "availability", url: "" },
    hospital: { mode: "screen", key: "refer", url: "" },
  };
}

function emptyDraft(): Draft {
  return {
    id: null,
    draftKey: newKey(),
    alreadyPublished: false,
    title: "",
    audiences: ["patient"],
    bannerUrl: null,
    popupUrl: null,
    bodyStored: null,
    ctaLabel: "",
    targets: emptyTargets(),
    startMode: "now",
    startsAt: "",
    stayMode: "7d",
    customAmount: "4",
    customUnit: "days",
    endsAt: "",
    dismissible: true,
    autoOpen: false,
  };
}

/** A stored row as the form's state. `asCopy` starts a new announcement
 *  from an old one ("Use again"): same words and pictures, fresh dates. */
function draftFromRow(row: AnnouncementRow, nowMs: number, asCopy: boolean): Draft {
  const targets = emptyTargets();
  const stored = readCtaTargets(row.cta_targets);
  for (const audience of ANNOUNCEMENT_AUDIENCES) {
    const t = stored[audience];
    if (t?.kind === "screen") targets[audience] = { mode: "screen", key: t.key, url: "" };
    else if (t?.kind === "web") targets[audience] = { ...targets[audience], mode: "web", url: t.url };
  }
  const status = announcementStatus(row, nowMs);
  const preset = DURATION_PRESETS.find((p) => p.minutes === row.duration_minutes);
  const keepWindow = !asCopy && status !== "ended";
  const draftKeyFromUrl = (row.banner_image_url ?? row.popup_image_url ?? "").match(
    /\/announcements\/([A-Za-z0-9_-]{8,64})\//
  )?.[1];
  return {
    id: asCopy ? null : row.id,
    // A copy gets its own folder, so replacing a picture on the copy can
    // never change the original's.
    draftKey: asCopy ? newKey() : draftKeyFromUrl ?? newKey(),
    alreadyPublished: !asCopy && !!row.published_at,
    title: row.title,
    audiences: ANNOUNCEMENT_AUDIENCES.filter((a) => row.audiences.includes(a)),
    bannerUrl: safeImageUrl(row.banner_image_url),
    popupUrl: safeImageUrl(row.popup_image_url),
    bodyStored: row.body,
    ctaLabel: row.cta_label ?? "",
    targets,
    startMode: keepWindow && row.starts_at && status === "scheduled" ? "at" : "now",
    startsAt: keepWindow && status === "scheduled" ? isoToClinicInput(row.starts_at) : "",
    stayMode: keepWindow
      ? row.duration_minutes
        ? preset
          ? preset.key
          : "custom"
        : row.ends_at
          ? "until"
          : "7d"
      : "7d",
    customAmount:
      keepWindow && row.duration_minutes && !preset
        ? String(
            row.duration_minutes % (24 * 60) === 0 ? row.duration_minutes / (24 * 60) : Math.round(row.duration_minutes / 60)
          )
        : "4",
    customUnit: keepWindow && row.duration_minutes && !preset && row.duration_minutes % (24 * 60) !== 0 ? "hours" : "days",
    endsAt: keepWindow && !row.duration_minutes ? isoToClinicInput(row.ends_at) : "",
    dismissible: row.dismissible,
    autoOpen: row.auto_open,
  };
}

/** Centre-crops a picture to a shape and caps its width, in the browser. A
 *  picture already that shape, and small enough, is sent as it is. */
async function cropToShape(file: File, shape: { width: number; height: number }, maxWidth: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const want = shape.width / shape.height;
  const has = bitmap.width / bitmap.height;
  if (Math.abs(has - want) / want < 0.01 && bitmap.width <= maxWidth) {
    bitmap.close();
    return file;
  }
  const cropW = has > want ? Math.round(bitmap.height * want) : bitmap.width;
  const cropH = has > want ? bitmap.height : Math.round(bitmap.width / want);
  const outW = Math.min(maxWidth, cropW);
  const outH = Math.round(outW / want);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, (bitmap.width - cropW) / 2, (bitmap.height - cropH) / 2, cropW, cropH, 0, 0, outW, outH);
  bitmap.close();
  const type = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  return blob ? new File([blob], file.name, { type }) : file;
}

const inputClass =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";
const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
const stepTitle = "font-display text-base font-bold text-slate-900";
const fieldLabel = "block text-[13px] font-semibold text-slate-700";
const hint = "text-xs text-slate-600";
const ghostButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

export default function AdminAnnouncementsManager({
  rows,
  serverNow,
}: {
  rows: AnnouncementRow[];
  /** The server's clock when the list was read, so "live" here is the same
   *  "live" the dashboards were given. */
  serverNow: number;
}) {
  const router = useRouter();
  const { show } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<AnnouncementImageSlot | null>(null);
  const [previewRole, setPreviewRole] = useState<AnnouncementAudience>("patient");
  const [previewOpen, setPreviewOpen] = useState(false);
  // The editor's document, once it has been touched; null means "as stored".
  const [bodyJson, setBodyJson] = useState<unknown>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useUnloadWarning(!!draft && dirty);

  const grouped = useMemo(() => {
    const by: Record<AnnouncementStatus, AnnouncementRow[]> = { live: [], scheduled: [], draft: [], ended: [] };
    for (const row of rows) by[announcementStatus(row, serverNow)].push(row);
    return by;
  }, [rows, serverNow]);

  function patch(next: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...next } : d));
    setDirty(true);
    setError(null);
  }

  function openForm(next: Draft) {
    setBodyJson(null);
    setDraft(next);
    setFormKey((k) => k + 1);
    setDirty(false);
    setError(null);
    setPreviewRole(next.audiences[0] ?? "patient");
    window.scrollTo({ top: 0 });
  }

  async function leaveForm() {
    if (dirty && !(await confirm("Leave without saving this announcement?", { confirmLabel: "Leave", cancelLabel: "Keep editing" }))) {
      return;
    }
    setDraft(null);
    setDirty(false);
    setError(null);
  }

  async function post(path: string, body: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return { ok: false, error: typeof data.error === "string" ? data.error : "That didn't save. Please try again." };
      }
      return { ok: true, data };
    } catch {
      return { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
    }
  }

  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  async function save(publish: boolean) {
    if (!draft || pending) return;
    const stay =
      draft.stayMode === "until"
        ? null
        : draft.stayMode === "custom"
          ? durationToMinutes(Number(draft.customAmount), draft.customUnit)
          : DURATION_PRESETS.find((p) => p.key === draft.stayMode)?.minutes ?? null;
    if (draft.stayMode === "custom" && !(Number(draft.customAmount) > 0)) {
      fail("Say how many hours or days it stays.");
      return;
    }
    const startsAt = draft.startMode === "at" ? clinicInputToIso(draft.startsAt) : null;
    if (draft.startMode === "at" && !startsAt) {
      fail("Pick the date and time it starts.");
      return;
    }
    const endsAt = draft.stayMode === "until" ? clinicInputToIso(draft.endsAt) : null;
    if (draft.stayMode === "until" && !endsAt) {
      fail("Pick the date and time it ends.");
      return;
    }
    const ctaTargets: Record<string, CtaTarget> = {};
    for (const audience of draft.audiences) {
      const t = draft.targets[audience];
      ctaTargets[audience] = t.mode === "web" ? { kind: "web", url: t.url.trim() } : { kind: "screen", key: t.key };
    }

    setPending(publish ? "publish" : "draft");
    const result = await post("/api/admin/announcements", {
      id: draft.id ?? undefined,
      title: draft.title,
      body: bodyJson ?? toEditorJson(parseRichText(draft.bodyStored, { tables: true })),
      bannerImageUrl: draft.bannerUrl,
      popupImageUrl: draft.popupUrl,
      audiences: draft.audiences,
      ctaLabel: draft.ctaLabel,
      ctaTargets,
      startsAt,
      endsAt,
      durationMinutes: stay,
      dismissible: draft.dismissible,
      autoOpen: draft.autoOpen,
      publish,
    });
    setPending(null);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    show(
      publish
        ? draft.alreadyPublished
          ? "Announcement updated."
          : draft.startMode === "at"
            ? "Announcement scheduled."
            : "Announcement published. It is on the dashboards now."
        : "Draft saved.",
      "success"
    );
    setDraft(null);
    setDirty(false);
    router.refresh();
  }

  async function act(kind: "end" | "delete", row: AnnouncementRow) {
    if (pending) return;
    const sure = await confirm(
      kind === "end"
        ? `Take "${row.title}" off every dashboard now?`
        : `Delete "${row.title}"? Its pictures are removed too.`,
      { confirmLabel: kind === "end" ? "End now" : "Delete", cancelLabel: "Cancel" }
    );
    if (!sure) return;
    setPending(`${kind}:${row.id}`);
    const result = await post(`/api/admin/announcements/${kind}`, { id: row.id });
    setPending(null);
    if (!result.ok) {
      show(result.error, "error");
      return;
    }
    show(kind === "end" ? "Announcement ended." : "Announcement deleted.", "success");
    router.refresh();
  }

  async function move(list: AnnouncementRow[], from: number, by: 1 | -1) {
    const to = from + by;
    if (pending || to < 0 || to >= list.length) return;
    const moved = [...list];
    [moved[from], moved[to]] = [moved[to], moved[from]];
    // Send every row, with this group's new order where the group sat, so
    // one group's change never reshuffles another.
    const movedIds = new Set(moved.map((r) => r.id));
    const queue = [...moved];
    const ids = rows.map((r) => (movedIds.has(r.id) ? (queue.shift() as AnnouncementRow).id : r.id));
    setPending("reorder");
    const result = await post("/api/admin/announcements/reorder", { ids });
    setPending(null);
    if (!result.ok) {
      show(result.error, "error");
      return;
    }
    show("Order saved.", "success");
    router.refresh();
  }

  async function upload(slot: AnnouncementImageSlot, file: File | undefined) {
    if (!draft || !file) return;
    if (!isAnnouncementImageType(file.type)) {
      fail(ANNOUNCEMENT_IMAGE_WRONG_TYPE);
      return;
    }
    setUploading(slot);
    try {
      const shaped =
        slot === "banner" ? await cropToShape(file, BANNER_ASPECT, 1800) : await cropToShape(file, POPUP_ASPECT, 1600);
      if (shaped.size > ANNOUNCEMENT_IMAGE_MAX_BYTES) {
        fail(ANNOUNCEMENT_IMAGE_TOO_LARGE);
        return;
      }
      const form = new FormData();
      form.set("draftKey", draft.draftKey);
      form.set("slot", slot);
      form.set("file", shaped);
      const res = await fetch("/api/admin/announcements/upload-image", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        fail(data.error ?? "That picture didn't upload. Please try again.");
        return;
      }
      patch(slot === "banner" ? { bannerUrl: data.url } : { popupUrl: data.url });
    } catch {
      fail("That picture couldn't be read. Please try a different file.");
    } finally {
      setUploading(null);
    }
  }

  // ---- the list ----------------------------------------------------------

  if (!draft) {
    const section = (status: AnnouncementStatus, heading: string, list: AnnouncementRow[], sortable: boolean) =>
      list.length === 0 ? null : (
        <div className="space-y-2.5" data-testid={`announcements-${status}`}>
          <h3 className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            {heading} ({list.length})
          </h3>
          {list.map((row, i) => {
            const targets = readCtaTargets(row.cta_targets);
            const style = STATUS_STYLE[status];
            const minutesLeft = row.ends_at ? (Date.parse(row.ends_at) - serverNow) / 60_000 : 0;
            return (
              <div
                key={row.id}
                data-testid="announcement-row"
                className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4"
              >
                {sortable && list.length > 1 && (
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => move(list, i, -1)}
                      disabled={i === 0 || !!pending}
                      aria-label={`Show "${row.title}" earlier`}
                      className="flex h-7 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <i aria-hidden="true" className="fa-solid fa-chevron-up text-xs"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => move(list, i, 1)}
                      disabled={i === list.length - 1 || !!pending}
                      aria-label={`Show "${row.title}" later`}
                      className="flex h-7 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <i aria-hidden="true" className="fa-solid fa-chevron-down text-xs"></i>
                    </button>
                  </div>
                )}
                <div className="w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg sm:w-60">
                  {safeImageUrl(row.banner_image_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.banner_image_url ?? undefined} alt="" className="block aspect-[6/1] w-full object-cover" />
                  ) : (
                    <span className="flex aspect-[6/1] w-full items-center gap-2 bg-teal-700 px-2.5 text-white">
                      <i aria-hidden="true" className="fa-solid fa-bullhorn text-[11px]"></i>
                      <span className="truncate text-xs font-bold">{row.title}</span>
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{row.title}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ANNOUNCEMENT_AUDIENCES.filter((a) => row.audiences.includes(a)).map((a) => (
                      <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {AUDIENCE_LABEL[a]}
                      </span>
                    ))}
                    {row.cta_label && Object.keys(targets).length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Button: {row.cta_label}
                      </span>
                    )}
                    {!row.dismissible && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Cannot be closed
                      </span>
                    )}
                    {row.auto_open && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Opens once by itself
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${style.className}`}>
                    {style.label}
                  </span>
                  <p className="mt-1 text-xs text-slate-600">
                    {status === "live" && `Ends ${formatClinicDateTime(row.ends_at)} (in ${describeMinutes(minutesLeft)})`}
                    {status === "scheduled" && `Starts ${formatClinicDateTime(row.starts_at)}`}
                    {status === "ended" && `Ended ${formatClinicDateTime(row.ends_at)}`}
                    {status === "draft" && "Not published"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {status === "ended" ? (
                    <button type="button" className={ghostButton} onClick={() => openForm(draftFromRow(row, serverNow, true))}>
                      Use again
                    </button>
                  ) : (
                    <button type="button" className={ghostButton} onClick={() => openForm(draftFromRow(row, serverNow, false))}>
                      Edit
                    </button>
                  )}
                  {(status === "live" || status === "scheduled") && (
                    <button
                      type="button"
                      className={`${ghostButton} text-red-700`}
                      disabled={!!pending}
                      onClick={() => act("end", row)}
                    >
                      {pending === `end:${row.id}` ? "Ending…" : "End now"}
                    </button>
                  )}
                  {status !== "live" && (
                    <button
                      type="button"
                      className={`${ghostButton} text-red-700`}
                      disabled={!!pending}
                      onClick={() => act("delete", row)}
                    >
                      {pending === `delete:${row.id}` ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );

    return (
      <div className="space-y-3" data-testid="announcements-manager">
        <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="font-display text-lg font-bold text-slate-800">Announcements</h2>
            <p className="mt-1 text-sm text-slate-600">
              A banner on top of the patient, therapist and hospital dashboards. People tap it to read the full
              message. When several are live they slide one after another, in the order shown here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openForm(emptyDraft())}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-teal-700 px-5 text-[15px] font-bold text-white transition hover:bg-teal-800"
          >
            <i aria-hidden="true" className="fa-solid fa-plus text-sm"></i>
            New announcement
          </button>
        </div>
        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-semibold text-slate-800">No announcements yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Post a festival greeting, a change in clinic timings, or anything every patient, therapist or
              hospital should see when they open their dashboard.
            </p>
          </div>
        )}
        {section("live", "Live now", grouped.live, true)}
        {section("scheduled", "Coming up", grouped.scheduled, true)}
        {section("draft", "Drafts", grouped.draft, false)}
        {section("ended", "Ended", grouped.ended, false)}
        {confirmDialog}
      </div>
    );
  }

  // ---- the form ----------------------------------------------------------

  const stayMinutes =
    draft.stayMode === "custom"
      ? Number(draft.customAmount) > 0
        ? durationToMinutes(Number(draft.customAmount), draft.customUnit)
        : null
      : DURATION_PRESETS.find((p) => p.key === draft.stayMode)?.minutes ?? null;
  const startIso = draft.startMode === "at" ? clinicInputToIso(draft.startsAt) : null;
  const endIso =
    draft.stayMode === "until"
      ? clinicInputToIso(draft.endsAt)
      : stayMinutes
        ? draft.startMode === "at"
          ? startIso
            ? new Date(Date.parse(startIso) + stayMinutes * 60_000).toISOString()
            : null
          : new Date(serverNow + stayMinutes * 60_000).toISOString()
        : null;
  const windowLine =
    draft.startMode === "at" && !startIso
      ? "Pick when it starts."
      : !endIso
        ? "Say how long it stays, or when it ends."
        : `${draft.startMode === "at" ? `From ${formatClinicDateTime(startIso)}` : "From the moment you publish"} until ${
            draft.startMode === "now" && draft.stayMode !== "until"
              ? `${describeMinutes(stayMinutes ?? 0)} later (about ${formatClinicDateTime(endIso)})`
              : formatClinicDateTime(endIso)
          }, India time. After that it removes itself.`;

  const previewTargets: Record<string, CtaTarget> = {};
  for (const a of draft.audiences) {
    const t = draft.targets[a];
    previewTargets[a] = t.mode === "web" ? { kind: "web", url: t.url.trim() } : { kind: "screen", key: t.key };
  }
  const role = draft.audiences.includes(previewRole) ? previewRole : draft.audiences[0] ?? "patient";
  const previewBody = bodyJson
    ? serializeRichText(sanitizeRichDoc(bodyJson, { tables: true }))
    : draft.bodyStored;
  const preview: DashboardAnnouncement = {
    id: draft.id ?? "preview",
    title: draft.title.trim() || "Your title",
    body: previewBody,
    bannerImageUrl: draft.bannerUrl,
    popupImageUrl: draft.popupUrl,
    cta: resolveCta(draft.ctaLabel, readCtaTargets(previewTargets), role),
    endsAt: endIso ?? new Date(serverNow + 7 * 24 * 3600_000).toISOString(),
    dismissible: draft.dismissible,
    autoOpen: false,
  };

  const picture = (slot: AnnouncementImageSlot) => {
    const url = slot === "banner" ? draft.bannerUrl : draft.popupUrl;
    const inputId = `announcement-${slot}-file`;
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <label
          htmlFor={inputId}
          className={`${ghostButton} cursor-pointer ${uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          <i aria-hidden="true" className="fa-solid fa-arrow-up-from-bracket text-xs"></i>
          {uploading === slot ? "Uploading…" : url ? "Replace" : "Upload a picture"}
        </label>
        <input
          id={inputId}
          type="file"
          accept={ANNOUNCEMENT_IMAGE_TYPES.join(",")}
          className="sr-only"
          data-testid={`announcement-${slot}-input`}
          disabled={!!uploading}
          onChange={(e) => {
            void upload(slot, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {url && (
          <button
            type="button"
            className={`${ghostButton} text-red-700`}
            onClick={() => patch(slot === "banner" ? { bannerUrl: null } : { popupUrl: null })}
          >
            Remove
          </button>
        )}
      </div>
    );
  };

  return (
    <div data-testid="announcement-form">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={leaveForm} className="mb-1 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800">
            <i aria-hidden="true" className="fa-solid fa-arrow-left text-xs"></i>
            All announcements
          </button>
          <h2 className="font-display text-xl font-bold text-slate-900">
            {draft.id ? "Edit announcement" : "New announcement"}
          </h2>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_32rem] space-y-4">
          {/* 1 */}
          <div className={`${cardClass} space-y-4`}>
            <h3 className={stepTitle}>1. Title and who sees it</h3>
            <div className="space-y-1.5">
              <label htmlFor="announcement-title" className={fieldLabel}>
                Title
              </label>
              <input
                id="announcement-title"
                type="text"
                value={draft.title}
                maxLength={ANNOUNCEMENT_TITLE_MAX}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Happy Diwali from all of us"
                className={inputClass}
              />
              <p className={hint}>
                The heading of the pop-up. It is also what the banner says when there is no banner picture.
              </p>
            </div>
            <fieldset>
              <legend className={`${fieldLabel} mb-2`}>Show on these dashboards</legend>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {ANNOUNCEMENT_AUDIENCES.map((a) => {
                  const on = draft.audiences.includes(a);
                  return (
                    <label
                      key={a}
                      className={`flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        on ? "border-2 border-teal-700 bg-teal-50 text-slate-900" : "border border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          patch({
                            audiences: ANNOUNCEMENT_AUDIENCES.filter((x) => (x === a ? !on : draft.audiences.includes(x))),
                          })
                        }
                        className="h-[18px] w-[18px] accent-teal-700"
                      />
                      {AUDIENCE_LABEL[a]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {/* 2 */}
          <div className={`${cardClass} space-y-4`}>
            <h3 className={stepTitle}>2. Pictures</h3>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={fieldLabel}>
                  Banner picture <span className="font-medium text-slate-600">(wide, 6 : 1, optional)</span>
                </span>
                <span className={hint}>Best size 1800 x 300. JPG, PNG or WebP, up to 4 MB.</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                {draft.bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.bannerUrl} alt="Banner picture" className="block aspect-[6/1] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[6/1] w-full items-center justify-center bg-slate-50 px-4 text-center text-[13px] font-medium text-slate-600">
                    No banner picture. The banner will show the title on a teal strip.
                  </div>
                )}
              </div>
              {picture("banner")}
              <p className={hint}>A picture of another shape is cropped to the middle, so it always fits the dashboard.</p>
            </div>
            <div className="h-px bg-slate-100"></div>
            <div className="flex flex-wrap gap-4">
              <div className="w-48 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                {draft.popupUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.popupUrl} alt="Pop-up picture" className="block aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-50 px-3 text-center text-[13px] font-medium text-slate-600">
                    No pop-up picture
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 basis-56 space-y-2">
                <span className={fieldLabel}>
                  Pop-up picture <span className="font-medium text-slate-600">(4 : 3, optional)</span>
                </span>
                <p className={hint}>
                  The big picture inside the pop-up. Best size 1600 x 1200. Leave it empty and the pop-up shows only
                  your text.
                </p>
                {picture("popup")}
              </div>
            </div>
          </div>

          {/* 3 */}
          <div className={`${cardClass} space-y-3`}>
            <h3 className={stepTitle}>3. Details shown in the pop-up</h3>
            <RichTextEditor
              key={formKey}
              initialDoc={parseRichText(draft.bodyStored, { tables: true })}
              onChange={(json) => {
                setBodyJson(json);
                setDirty(true);
              }}
              label="Announcement details"
              placeholder="Write the full message. Use Table for timings or a list of dates."
              testId="announcement-body-editor"
              tables
            />
          </div>

          {/* 4 */}
          <div className={`${cardClass} space-y-3.5`}>
            <h3 className={stepTitle}>
              4. Button in the pop-up <span className="font-sans text-[13px] font-medium text-slate-600">(optional)</span>
            </h3>
            <div className="space-y-1.5">
              <label htmlFor="announcement-cta" className={fieldLabel}>
                Words on the button
              </label>
              <input
                id="announcement-cta"
                type="text"
                value={draft.ctaLabel}
                maxLength={ANNOUNCEMENT_CTA_LABEL_MAX}
                onChange={(e) => patch({ ctaLabel: e.target.value })}
                placeholder="Leave empty for no button"
                className={`${inputClass} max-w-sm`}
              />
            </div>
            {draft.ctaLabel.trim() && (
              <div className="space-y-2.5">
                <p className={fieldLabel}>Where the button takes them</p>
                {draft.audiences.map((a) => {
                  const t = draft.targets[a];
                  const setTarget = (next: Partial<TargetDraft>) =>
                    patch({ targets: { ...draft.targets, [a]: { ...t, ...next } } });
                  return (
                    <div key={a} className="flex flex-wrap items-center gap-2.5">
                      <label htmlFor={`announcement-target-${a}`} className="w-24 shrink-0 text-[13px] font-semibold text-slate-600">
                        {AUDIENCE_LABEL[a]}
                      </label>
                      <select
                        id={`announcement-target-${a}`}
                        value={t.mode === "web" ? "__web" : t.key}
                        onChange={(e) =>
                          e.target.value === "__web" ? setTarget({ mode: "web" }) : setTarget({ mode: "screen", key: e.target.value })
                        }
                        className={`${inputClass} min-w-0 flex-1 basis-56`}
                      >
                        {ANNOUNCEMENT_DESTINATIONS[a].map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                        <option value="__web">A web link&hellip;</option>
                      </select>
                      {t.mode === "web" && (
                        <input
                          type="url"
                          inputMode="url"
                          aria-label={`Web link for ${AUDIENCE_LABEL[a]}`}
                          value={t.url}
                          onChange={(e) => setTarget({ url: e.target.value })}
                          placeholder="https://"
                          className={`${inputClass} min-w-0 flex-1 basis-56`}
                        />
                      )}
                    </div>
                  );
                })}
                <p className={hint}>
                  You choose from the real screens of each dashboard, so a button can never lead to a page that
                  person cannot open.
                </p>
              </div>
            )}
          </div>

          {/* 5 + 6 */}
          <div className={`${cardClass} space-y-4`}>
            <h3 className={stepTitle}>5. When it is live</h3>
            <fieldset>
              <legend className={`${fieldLabel} mb-2`}>Starts</legend>
              <div className="flex flex-wrap gap-2.5">
                {(
                  [
                    ["now", "As soon as I publish"],
                    ["at", "On a date and time"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold ${
                      draft.startMode === value
                        ? "border-2 border-teal-700 bg-teal-50 text-slate-900"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="announcement-start"
                      checked={draft.startMode === value}
                      onChange={() => patch({ startMode: value })}
                      className="accent-teal-700"
                    />
                    {label}
                  </label>
                ))}
                {draft.startMode === "at" && (
                  <DateField
                    ariaLabel="Start date and time (India time)"
                    value={draft.startsAt}
                    onChange={(next) => patch({ startsAt: next })}
                    withTime
                    minDateKey={isoToClinicInput(new Date(serverNow).toISOString()).slice(0, 10)}
                    placeholder="Pick a date and time"
                    dialogTitle="When it starts"
                  />
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend className={`${fieldLabel} mb-2`}>Stays for</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ...DURATION_PRESETS.map((p) => [p.key, p.label] as const),
                    ["custom", "My own time"] as const,
                    ["until", "Until a date"] as const,
                  ] as readonly (readonly [StayMode, string])[]
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-semibold ${
                      draft.stayMode === value
                        ? "border-2 border-teal-700 bg-teal-50 text-slate-900"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="announcement-stay"
                      checked={draft.stayMode === value}
                      onChange={() => patch({ stayMode: value })}
                      className="accent-teal-700"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.stayMode === "custom" && (
              <div className="flex flex-wrap items-center gap-2.5">
                <label htmlFor="announcement-stay-amount" className={fieldLabel}>
                  Keep it for
                </label>
                <input
                  id="announcement-stay-amount"
                  type="text"
                  inputMode="numeric"
                  value={draft.customAmount}
                  onChange={(e) => patch({ customAmount: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
                  className={`${inputClass} w-20`}
                />
                <select
                  aria-label="Hours or days"
                  value={draft.customUnit}
                  onChange={(e) => patch({ customUnit: e.target.value as DurationUnit })}
                  className={`${inputClass} w-auto`}
                >
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
            )}
            {draft.stayMode === "until" && (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={fieldLabel}>Ends at (India time)</span>
                <DateField
                  ariaLabel="End date and time (India time)"
                  value={draft.endsAt}
                  onChange={(next) => patch({ endsAt: next })}
                  withTime
                  minDateKey={isoToClinicInput(new Date(serverNow).toISOString()).slice(0, 10)}
                  placeholder="Pick a date and time"
                  dialogTitle="When it ends"
                />
              </div>
            )}
            <p className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-3 text-sm font-semibold text-teal-900" data-testid="announcement-window">
              <i aria-hidden="true" className="fa-solid fa-clock mt-0.5 text-sm"></i>
              <span>{windowLine}</span>
            </p>

            <div className="h-px bg-slate-100"></div>
            <h3 className={stepTitle}>6. How it behaves</h3>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={draft.dismissible}
                onChange={(e) => patch({ dismissible: e.target.checked })}
                className="mt-0.5 h-[18px] w-[18px] accent-teal-700"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">People can close this banner</span>
                <span className={hint}>Good for wishes. Untick for a notice everyone must keep seeing until it ends.</span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={draft.autoOpen}
                onChange={(e) => patch({ autoOpen: e.target.checked })}
                className="mt-0.5 h-[18px] w-[18px] accent-teal-700"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Open the pop-up once by itself</span>
                <span className={hint}>
                  Each person sees the pop-up one time when they open their dashboard. After that, only when they
                  tap the banner.
                </span>
              </span>
            </label>
          </div>

          {error && (
            <p ref={errorRef} role="alert" data-form-error className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 pb-4">
            <button type="button" onClick={leaveForm} className={`${ghostButton} min-h-12 px-5 text-[15px]`}>
              Cancel
            </button>
            {!draft.alreadyPublished && (
              <button
                type="button"
                onClick={() => save(false)}
                disabled={!!pending || !!uploading}
                className={`${ghostButton} min-h-12 px-5 text-[15px] font-bold`}
              >
                {pending === "draft" ? "Saving…" : "Save as draft"}
              </button>
            )}
            <button
              type="button"
              onClick={() => save(true)}
              disabled={!!pending || !!uploading}
              data-testid="announcement-publish"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-teal-700 px-6 text-[15px] font-bold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {pending === "publish"
                ? "Saving…"
                : draft.alreadyPublished
                  ? "Save changes"
                  : draft.startMode === "at"
                    ? "Schedule"
                    : "Publish now"}
            </button>
          </div>
        </div>

        {/* LIVE PREVIEW */}
        <div className={`${cardClass} min-w-0 flex-[1_1_20rem] space-y-3.5 lg:sticky lg:top-4 lg:max-w-sm`} data-testid="announcement-preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={stepTitle}>Live preview</h3>
            {draft.audiences.length > 1 && (
              <div className="flex rounded-xl bg-slate-100 p-0.5">
                {draft.audiences.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setPreviewRole(a)}
                    aria-pressed={role === a}
                    className={`min-h-9 rounded-lg px-2.5 text-xs font-bold ${
                      role === a ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {AUDIENCE_LABEL[a]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Banner on the dashboard</p>
          <div className="overflow-hidden rounded-xl">
            {draft.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.bannerUrl} alt="" className="block aspect-[6/1] w-full object-cover" />
            ) : (
              <span className="flex aspect-[6/1] w-full items-center gap-2.5 bg-teal-700 px-3 text-white">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <i aria-hidden="true" className="fa-solid fa-bullhorn text-[10px]"></i>
                </span>
                <span className="line-clamp-2 text-[13px] font-bold leading-tight">{preview.title}</span>
              </span>
            )}
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">One line on other screens</p>
          <div className="flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-3 text-white">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
              <i aria-hidden="true" className="fa-solid fa-bullhorn text-[10px]"></i>
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{preview.title}</span>
            {draft.dismissible && <i aria-hidden="true" className="fa-solid fa-xmark text-xs"></i>}
          </div>
          <button type="button" onClick={() => setPreviewOpen(true)} className={`${ghostButton} min-h-11 w-full font-bold text-teal-700`}>
            Open the pop-up as {AUDIENCE_LABEL[role].toLowerCase()} will see it
          </button>
        </div>
      </div>

      {previewOpen && <AnnouncementDialog announcement={preview} onClose={() => setPreviewOpen(false)} />}
      {confirmDialog}
    </div>
  );
}
