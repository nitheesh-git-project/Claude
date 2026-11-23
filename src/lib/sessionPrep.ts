// The guided check's "Get ready" list (phase 2, P1): what to have to hand
// before a video session, in the patient's own words, so the set-up is done
// the evening before rather than live on camera. One list per guided-check
// protocol, the items taken from that protocol's set-up checklists
// (src/lib/sessionProtocols.ts) and said as a patient would read them.
//
// Dependency-free and display-only: the list never gates anything. The
// therapist still confirms the set-up in the session, and the server is
// still the gate on every save.

import { CLINICAL_REVIEW_MARK, containsClinicWord, defaultProtocolFor, sessionProtocol } from "@/lib/sessionProtocols";
import type { ProfileKind } from "@/lib/outcomeMeasures";

/** The small fixed set of pictures an item may carry. */
export type PrepIcon = "chair" | "towel" | "path" | "shoes" | "helper" | "device" | "space" | "toy" | "monitor" | "medicine";

export type PrepItem = { id: string; icon: PrepIcon; text: string };

export type PrepList = {
  /** The protocol the list is for (sessionProtocols.ts). */
  protocolKey: string;
  items: readonly PrepItem[];
  review: typeof CLINICAL_REVIEW_MARK;
};

const R = CLINICAL_REVIEW_MARK;

const DEVICE: PrepItem = { id: "device", icon: "device", text: "Your phone or laptop charged, and something to prop it up so we can see you" };
const CLEAR_SPACE: PrepItem = { id: "space", icon: "space", text: "A clear space to move in, with nothing to trip over" };
const PATH: PrepItem = { id: "path", icon: "path", text: "A clear path of about 14 metres, like a long hallway" };
const HELPER_IF_YOU_CAN: PrepItem = { id: "helper", icon: "helper", text: "If you can, someone at home to stand beside you" };
const HELPER: PrepItem = { id: "helper", icon: "helper", text: "Another adult at home who can stand beside you" };

const LISTS: Record<string, readonly PrepItem[]> = {
  ortho_knee: [
    { id: "chair", icon: "chair", text: "A sturdy chair without arms, pushed against a wall" },
    { id: "towel", icon: "towel", text: "A towel you can roll up" },
    PATH,
    { id: "shoes", icon: "shoes", text: "Your usual shoes, and your walking aid if you use one" },
    HELPER_IF_YOU_CAN,
    DEVICE,
  ],
  ortho_general: [
    { id: "clothes", icon: "space", text: "Clothes that let us see the sore joint or your back" },
    CLEAR_SPACE,
    DEVICE,
  ],
  neuro: [
    PATH,
    { id: "shoes", icon: "shoes", text: "Your usual shoes, splints and walking aid" },
    HELPER,
    DEVICE,
  ],
  neuro_parkinsons: [
    { id: "chair", icon: "chair", text: "A chair with arms, and a clear path of about 14 metres" },
    { id: "medicine", icon: "medicine", text: "Take your medicine as usual, and note the time of your last dose" },
    HELPER,
    DEVICE,
  ],
  pediatrics: [
    { id: "space", icon: "space", text: "Clear floor space where your child can sit, crawl and stand" },
    { id: "toy", icon: "toy", text: "Your child's favourite toy" },
    { id: "helper", icon: "helper", text: "A parent who can stay close and move the camera" },
    DEVICE,
  ],
  geriatric: [
    { id: "chair", icon: "chair", text: "A sturdy chair, pushed against a wall" },
    PATH,
    { id: "shoes", icon: "shoes", text: "Your usual shoes, and your walking aid if you use one" },
    HELPER,
    DEVICE,
  ],
  cardiopulmonary: [
    { id: "monitor", icon: "monitor", text: "Your own oxygen meter and blood pressure monitor, charged" },
    { id: "chair", icon: "chair", text: "A sturdy chair without arms, pushed against a wall" },
    HELPER_IF_YOU_CAN,
    DEVICE,
  ],
};

/** The list for a protocol, or null when none is written for it. */
export function prepListForProtocol(protocolKey: string): PrepList | null {
  const items = LISTS[protocolKey];
  if (!items || !sessionProtocol(protocolKey)) return null;
  return { protocolKey, items, review: R };
}

/** The list for a patient's condition type: its default guided check's. */
export function prepListFor(kind: ProfileKind): PrepList | null {
  const protocol = defaultProtocolFor(kind);
  return protocol ? prepListForProtocol(protocol.key) : null;
}

/** Every protocol that has a list, for the tests. */
export const PREP_PROTOCOL_KEYS: readonly string[] = Object.keys(LISTS);

/** Problems with the lists: a clinic word, an over-long item, a duplicate id,
 *  more than six items. Checked by the unit tests. */
export function prepListProblems(): string[] {
  const problems: string[] = [];
  for (const [key, items] of Object.entries(LISTS)) {
    if (!sessionProtocol(key)) problems.push(`${key}: no such protocol`);
    if (items.length === 0 || items.length > 6) problems.push(`${key}: ${items.length} items`);
    const ids = new Set<string>();
    for (const item of items) {
      if (ids.has(item.id)) problems.push(`${key}.${item.id}: duplicate id`);
      ids.add(item.id);
      if (item.text.length > 90) problems.push(`${key}.${item.id}: too long`);
      const word = containsClinicWord(item.text);
      if (word) problems.push(`${key}.${item.id}: clinic word "${word}"`);
    }
  }
  return problems;
}

// --- When the list shows, and what the therapist reads ------------------------------------

const HOUR = 60 * 60 * 1000;
/** The list shows from two days before a session until it ends. */
export const PREP_LEAD_MS = 48 * HOUR;

/** Whether the get-ready list is shown for a session now: from two days
 *  before its start until its end. */
export function prepWindowOpen(slotIso: string, durationMinutes: number | null, nowMs: number): boolean {
  const start = Date.parse(slotIso);
  if (!Number.isFinite(start)) return false;
  const end = start + Math.max(0, durationMinutes ?? 60) * 60 * 1000;
  return nowMs >= start - PREP_LEAD_MS && nowMs < end;
}

/** What the therapist's start screen knows about the patient's list. */
export type Readiness =
  | { status: "ready"; at: string }
  | { status: "not_yet" }
  | { status: "no_session" }
  | { status: "unknown" };

/**
 * The start screen's one line about it. A read that failed is "couldn't
 * check", never "not ready"; no ready tick is not a problem, only a fact
 * (most people get ready without pressing anything).
 */
export function readinessLine(r: Readiness, firstName: string, formatTime: (iso: string) => string): { tone: "ok" | "info" | "unknown"; text: string } | null {
  if (r.status === "ready") return { tone: "ok", text: `${firstName} is ready · ticked the get-ready list at ${formatTime(r.at)}` };
  if (r.status === "not_yet") return { tone: "info", text: `${firstName} hasn't ticked the get-ready list. Check the set-up on camera as usual.` };
  if (r.status === "unknown") return { tone: "unknown", text: `Couldn't check whether ${firstName} ticked the get-ready list.` };
  return null;
}
