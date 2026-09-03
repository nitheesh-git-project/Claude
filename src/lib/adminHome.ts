import {
  ADMIN_SECTIONS,
  adminScreenHref,
  type AdminQueueDomain,
  type AdminSectionKey,
  type InboxGroup,
} from "@/lib/adminNav";
import {
  ADMIN_SCOPE_BLURBS,
  ADMIN_SCOPE_LABELS,
  scopeCanOpen,
  sectionsForScope,
  type AdminScope,
} from "@/lib/adminScope";

// What each admin scope opens on.
//
// Four scopes have existed since access was split up (adminScope.ts), but
// only one dashboard did: every one of them landed on a Today screen built
// for a `full` admin, and the mismatch was not cosmetic.
//
//   - The headline and the "Needs a person" figure summed *every* queue,
//     while the queue list beneath them was already filtered to what the
//     viewer could open. A clinical admin read "23 things waiting on an
//     admin" over a list of four. That is the "list disagrees with the
//     number" failure the ?view= presets exist to prevent, in the one place
//     a person looks first.
//   - The quick actions were hardcoded at Sessions and Money. findTab falls
//     back to the first section a scope *can* open, so a finance admin
//     tapping "All sessions" silently landed back on Today -- a dead link
//     that looks like it worked, exactly the gotcha AGENTS.md names.
//   - The four figures asked a full admin's questions. A finance admin's
//     headline numbers were sessions today and unassigned sessions, two
//     screens they cannot open and no money figure at all; a clinical
//     admin's never mentioned the recommendation queue, the one queue with
//     a patient waiting on the other side of it.
//
// So the greeting, the figures, the actions and the queue order are decided
// here, once, for all four scopes -- rather than in the page, where four
// dashboards would drift into four slightly different answers to the same
// question. Everything this returns is reachable by construction: a cell
// links only where the scope may go, and an action for a section the scope
// cannot open is dropped rather than rendered as a trapdoor.
//
// This is emphasis, never permission. Nothing here hides a queue a scope is
// allowed to work (the routes decide that, and the sidebar's filtering is
// presentation over the same list) -- it decides what a role reads first.

export type AdminHomeCounts = {
  sessionsToday: number;
  unassignedToday: number;
  unassignedTotal: number;
  pendingAccounts: number;
  pendingProfileChanges: number;
  carePlansPending: number;
  /** Of those, how many have been queued longer than the stale threshold --
   *  the only thing that makes this queue urgent rather than merely open. */
  carePlansStale: number;
  conditionRequestsPending: number;
  conditionAccessPending: number;
  payoutRequestsOpen: number;
  cashToRemitVisits: number;
  manualRefundsPending: number;
  /** What the queues this viewer can actually open add up to. Computed by
   *  visibleQueueTotal from the same groups the queue list renders, so the
   *  figure and the list can never disagree. */
  needsYouTotal: number;
  /** All-time and net of cash held: the same figure the Payouts screen
   *  shows and the Pay button transfers, never date-scoped (AGENTS.md's
   *  "a balance is never date-filtered"). Null when the viewer's scope
   *  cannot open Money, which is also when the page declines to compute it
   *  -- a figure nobody may read is not worth the pass over appointments. */
  owedToTherapistsPaise: number | null;
};

/** Structurally a StatStrip `StatCell`, minus the interactive fields no
 *  server-rendered strip uses. Declared here rather than imported so this
 *  module stays free of component (and React) imports and can be unit
 *  tested, the same rule the rest of src/lib follows. */
export type AdminHomeCell = {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  accent?: string;
  href?: string;
};

export type AdminHomeAction = {
  label: string;
  hint: string;
  icon: string;
  href: string;
  primary?: boolean;
};

/** The line that tells a scoped admin why their sidebar is shorter than
 *  their colleague's. Null for `full`, which has nothing to explain. */
export type AdminAccessNote = {
  scopeLabel: string;
  blurb: string;
  /** Section labels this scope can open, in sidebar order. */
  sections: string[];
  /** The ones it cannot. Named rather than merely absent: "Money is not
   *  yours to open" is an answer, a missing sidebar entry is a mystery. */
  withheld: string[];
};

export type AdminHome = {
  greeting: string;
  headline: string;
  cells: AdminHomeCell[];
  actions: AdminHomeAction[];
  accessNote: AdminAccessNote | null;
};

const money = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A link only where the scope may follow it. An admin handed a link into a
 *  403 -- or worse, one that quietly redirects somewhere else -- learns not
 *  to trust the figure above it either. */
function link(
  scope: AdminScope,
  section: AdminSectionKey,
  tab: string,
  view?: string
): string | undefined {
  return scopeCanOpen(scope, section) ? adminScreenHref(section, tab, view) : undefined;
}

/** A queue count reads red when somebody is waiting, green when it is
 *  clear, and slate when it is a plain figure rather than a queue. */
function queueAccent(count: number, urgent = false): string {
  if (count === 0) return "bg-emerald-500";
  return urgent ? "bg-red-500" : "bg-amber-500";
}

function needsYouCell(counts: AdminHomeCounts, scopeNote: string): AdminHomeCell {
  return {
    label: "Needs you",
    value: String(counts.needsYouTotal),
    note: counts.needsYouTotal === 0 ? "Your queues are clear" : scopeNote,
    accent: counts.needsYouTotal > 0 ? "bg-red-500" : "bg-emerald-500",
  };
}

function sessionsTodayCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  return {
    label: "Sessions today",
    value: String(counts.sessionsToday),
    note:
      counts.unassignedToday > 0
        ? `${counts.unassignedToday} with no therapist yet`
        : "All of today's work is assigned",
    accent: counts.unassignedToday > 0 ? "bg-amber-500" : "bg-teal-500",
    href: link(scope, "sessions", "all", "today"),
  };
}

function unassignedCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  return {
    label: "Unassigned sessions",
    value: String(counts.unassignedTotal),
    note:
      counts.unassignedTotal === 0
        ? "Every booking has a clinician"
        : "Booked but nobody is running them",
    accent: queueAccent(counts.unassignedTotal, counts.unassignedToday > 0),
    href: link(scope, "sessions", "all", "unassigned"),
  };
}

function cashToRemitCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  return {
    label: "Cash to remit",
    value: String(counts.cashToRemitVisits),
    unit: plural(counts.cashToRemitVisits, "visit", "visits"),
    note:
      counts.manualRefundsPending > 0
        ? `${counts.manualRefundsPending} manual refund${
            counts.manualRefundsPending === 1 ? "" : "s"
          } pending too`
        : "Cash collected on home visits, not yet handed in",
    accent: queueAccent(counts.cashToRemitVisits, counts.manualRefundsPending > 0),
    href: link(scope, "money", "payouts", "owed"),
  };
}

function approvalsCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  const waiting = counts.pendingAccounts + counts.pendingProfileChanges;
  return {
    label: "Approvals waiting",
    value: String(waiting),
    note:
      waiting === 0
        ? "No signups or change requests open"
        : `${counts.pendingAccounts} signup${counts.pendingAccounts === 1 ? "" : "s"}, ${
            counts.pendingProfileChanges
          } change request${counts.pendingProfileChanges === 1 ? "" : "s"}`,
    accent: queueAccent(waiting),
    href: link(scope, "today", "approvals"),
  };
}

function recommendationsCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  return {
    label: "Recommendations",
    value: String(counts.carePlansPending),
    note:
      counts.carePlansPending === 0
        ? "Nothing waiting on a clinical decision"
        : counts.carePlansStale > 0
          ? `${counts.carePlansStale} of them ${plural(
              counts.carePlansStale,
              "has",
              "have"
            )} been waiting too long`
          : "The patient cannot see these until they are approved",
    accent: queueAccent(counts.carePlansPending, counts.carePlansStale > 0),
    href: link(scope, "sessions", "recommendations"),
  };
}

function careRecordsCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  const waiting = counts.conditionRequestsPending + counts.conditionAccessPending;
  return {
    label: "Care records",
    value: String(waiting),
    note:
      waiting === 0
        ? "No health profile work waiting"
        : `${counts.conditionRequestsPending} submission${
            counts.conditionRequestsPending === 1 ? "" : "s"
          }, ${counts.conditionAccessPending} access request${
            counts.conditionAccessPending === 1 ? "" : "s"
          }`,
    accent: queueAccent(waiting),
    href: link(scope, "people", "patients"),
  };
}

function owedCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  const owed = counts.owedToTherapistsPaise;
  return {
    label: "Owed to therapists",
    // All-time, so it is deliberately not a "this month" figure -- see the
    // balance rule in AGENTS.md. An em dash rather than ₹0 when it could
    // not be computed: zero is an answer, and this is the absence of one.
    value: owed === null ? "—" : money(owed),
    note:
      owed === null
        ? "Not available"
        : counts.cashToRemitVisits > 0
          ? `Net of cash still with therapists (${counts.cashToRemitVisits} ${plural(
              counts.cashToRemitVisits,
              "visit",
              "visits"
            )})`
          : "All-time, net of cash held. What Pay would transfer.",
    // Slate for the unknown case rather than green: an absent answer must
    // not read as "nothing is owed".
    accent: owed === null ? "bg-slate-400" : owed > 0 ? "bg-amber-500" : "bg-emerald-500",
    href: link(scope, "money", "payouts", "owed"),
  };
}

function payoutRequestsCell(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell {
  return {
    label: "Payout requests",
    value: String(counts.payoutRequestsOpen),
    note:
      counts.payoutRequestsOpen === 0
        ? "Nobody has asked to be paid"
        : "A therapist has asked to be paid",
    accent: queueAccent(counts.payoutRequestsOpen),
    href: link(scope, "money", "payouts"),
  };
}

// Greetings and headlines. Each names the one fact that scope opens the
// dashboard to find out, and says "nothing" plainly when there is nothing --
// a headline that manufactures urgency out of an empty queue is how a
// person stops reading the headline.
function headlineFor(scope: AdminScope, counts: AdminHomeCounts): string {
  const sessions = `${counts.sessionsToday} ${plural(counts.sessionsToday, "session", "sessions")} scheduled today`;
  // The same fact as a sentence of its own, for headlines that end on it.
  // "and 9 sessions scheduled today" reads as a dropped verb when it
  // follows a full clause.
  const sessionsSentence = `${counts.sessionsToday} ${plural(
    counts.sessionsToday,
    "session is",
    "sessions are"
  )} scheduled today.`;

  if (scope === "operations") {
    if (counts.unassignedTotal > 0) {
      return `${counts.unassignedTotal} booked ${plural(
        counts.unassignedTotal,
        "session has",
        "sessions have"
      )} nobody to run ${plural(counts.unassignedTotal, "it", "them")}. ${sessionsSentence}`;
    }
    const approvals = counts.pendingAccounts + counts.pendingProfileChanges;
    if (approvals > 0) {
      return `Every session has a therapist. ${approvals} ${plural(
        approvals,
        "approval is",
        "approvals are"
      )} waiting. ${sessionsSentence}`;
    }
    return `Every session has a therapist and no approvals are waiting. ${sessionsSentence}`;
  }

  if (scope === "finance") {
    const owed = counts.owedToTherapistsPaise;
    const owedPart = owed !== null && owed > 0 ? `${money(owed)} is owed to therapists` : null;
    const requests =
      counts.payoutRequestsOpen > 0
        ? `${counts.payoutRequestsOpen} payout ${plural(
            counts.payoutRequestsOpen,
            "request is",
            "requests are"
          )} open`
        : null;
    const cash =
      counts.cashToRemitVisits > 0
        ? `${counts.cashToRemitVisits} ${plural(
            counts.cashToRemitVisits,
            "visit's",
            "visits'"
          )} cash is still with a therapist`
        : null;
    const parts = [owedPart, requests, cash].filter(Boolean) as string[];
    if (parts.length === 0) return "Nothing is owed, nothing is requested, and no cash is out.";
    // "A, and B, and C" reads as three headlines stapled together; one
    // "and", at the end, is a sentence.
    const last = parts.pop() as string;
    return parts.length === 0 ? `${last}.` : `${parts.join(", ")}, and ${last}.`;
  }

  if (scope === "clinical") {
    if (counts.carePlansPending > 0) {
      const stale =
        counts.carePlansStale > 0
          ? ` ${counts.carePlansStale} of them ${plural(
              counts.carePlansStale,
              "has",
              "have"
            )} been waiting too long.`
          : "";
      return `${counts.carePlansPending} ${plural(
        counts.carePlansPending,
        "recommendation is",
        "recommendations are"
      )} waiting on the clinic, and the ${plural(
        counts.carePlansPending,
        "patient cannot",
        "patients cannot"
      )} see ${plural(counts.carePlansPending, "it", "them")} yet.${stale}`;
    }
    const records = counts.conditionRequestsPending + counts.conditionAccessPending;
    if (records > 0) {
      return `No recommendations are waiting. ${records} health ${plural(
        records,
        "record needs",
        "records need"
      )} a decision. ${sessionsSentence}`;
    }
    return `Nothing clinical is waiting on you. ${sessionsSentence}`;
  }

  // full
  return counts.needsYouTotal > 0
    ? `${counts.needsYouTotal} ${plural(counts.needsYouTotal, "thing", "things")} waiting on an admin, and ${sessions}.`
    : `Nothing is waiting on you. ${sessions}.`;
}

const GREETINGS: Record<AdminScope, string> = {
  full: "The clinic today",
  operations: "Operations today",
  finance: "The books today",
  clinical: "Clinical today",
};

const NEEDS_YOU_NOTES: Record<AdminScope, string> = {
  full: "Across approvals, scheduling and money",
  operations: "Across scheduling, approvals and the catalog",
  finance: "Across payouts, cash and approvals",
  clinical: "Across recommendations, records and sessions",
};

function cellsFor(scope: AdminScope, counts: AdminHomeCounts): AdminHomeCell[] {
  const needsYou = needsYouCell(counts, NEEDS_YOU_NOTES[scope]);
  switch (scope) {
    case "operations":
      // Assignment first: it is the one thing on this list with a booked
      // patient and no clinician behind it.
      return [
        unassignedCell(scope, counts),
        sessionsTodayCell(scope, counts),
        approvalsCell(scope, counts),
        needsYou,
      ];
    case "finance":
      // A balance, then the two queues that move money out, then the total.
      return [
        owedCell(scope, counts),
        payoutRequestsCell(scope, counts),
        cashToRemitCell(scope, counts),
        needsYou,
      ];
    case "clinical":
      return [
        recommendationsCell(scope, counts),
        careRecordsCell(scope, counts),
        sessionsTodayCell(scope, counts),
        needsYou,
      ];
    default:
      return [
        sessionsTodayCell(scope, counts),
        needsYou,
        unassignedCell(scope, counts),
        cashToRemitCell(scope, counts),
      ];
  }
}

type ActionSpec = Omit<AdminHomeAction, "href"> & {
  section: AdminSectionKey;
  tab: string;
  view?: string;
};

const ACTIONS: Record<AdminScope, ActionSpec[]> = {
  full: [
    {
      label: "Approvals",
      hint: "Signups and profile change requests",
      icon: "fa-user-check",
      section: "today",
      tab: "approvals",
      primary: true,
    },
    {
      label: "All sessions",
      hint: "Assign, reschedule, refund",
      icon: "fa-calendar-check",
      section: "sessions",
      tab: "all",
    },
    {
      label: "Money summary",
      hint: "Revenue, payouts and cash",
      icon: "fa-indian-rupee-sign",
      section: "money",
      tab: "summary",
    },
  ],
  operations: [
    {
      label: "Assign a session",
      hint: "Bookings with nobody to run them",
      icon: "fa-user-plus",
      section: "sessions",
      tab: "all",
      view: "unassigned",
      primary: true,
    },
    {
      label: "Approvals",
      hint: "Signups and profile change requests",
      icon: "fa-user-check",
      section: "today",
      tab: "approvals",
    },
    {
      label: "Roster",
      hint: "Weekly schedules, exceptions and leave",
      icon: "fa-calendar-days",
      section: "sessions",
      tab: "roster",
    },
    {
      label: "New booking",
      hint: "Book on a patient's behalf",
      icon: "fa-calendar-plus",
      section: "sessions",
      tab: "new",
    },
  ],
  finance: [
    {
      label: "Money summary",
      hint: "Revenue, refunds and the split",
      icon: "fa-indian-rupee-sign",
      section: "money",
      tab: "summary",
      primary: true,
    },
    {
      label: "Payouts",
      hint: "What each therapist is owed, and pay it",
      icon: "fa-money-bill-transfer",
      section: "money",
      tab: "payouts",
      view: "owed",
    },
    {
      label: "Transactions",
      hint: "Every payment, refund and failure",
      icon: "fa-receipt",
      section: "money",
      tab: "transactions",
    },
    {
      label: "Costs",
      hint: "Expenses, gateway fees and campaigns",
      icon: "fa-file-invoice-dollar",
      section: "money",
      tab: "costs",
    },
  ],
  clinical: [
    {
      label: "Recommendations",
      hint: "Approve, change or turn down a programme",
      icon: "fa-clipboard-check",
      section: "sessions",
      tab: "recommendations",
      primary: true,
    },
    {
      label: "Patients",
      hint: "Health profiles, records and access",
      icon: "fa-user-injured",
      section: "people",
      tab: "patients",
    },
    {
      label: "All sessions",
      hint: "What was delivered, and by whom",
      icon: "fa-calendar-check",
      section: "sessions",
      tab: "all",
    },
    {
      label: "Roster",
      hint: "Who is working, and who is on leave",
      icon: "fa-calendar-days",
      section: "sessions",
      tab: "roster",
    },
  ],
};

function accessNoteFor(scope: AdminScope): AdminAccessNote | null {
  // A full admin sees every section, so there is nothing to account for --
  // and a card saying "you can open everything" is a line nobody needs to
  // read twice.
  if (scope === "full") return null;
  const allowed = sectionsForScope(scope);
  return {
    scopeLabel: ADMIN_SCOPE_LABELS[scope],
    blurb: ADMIN_SCOPE_BLURBS[scope],
    sections: ADMIN_SECTIONS.filter((s) => allowed.includes(s.key)).map((s) => s.label),
    withheld: ADMIN_SECTIONS.filter((s) => !allowed.includes(s.key)).map((s) => s.label),
  };
}

export function buildAdminHome(scope: AdminScope, counts: AdminHomeCounts): AdminHome {
  return {
    greeting: GREETINGS[scope] ?? GREETINGS.full,
    headline: headlineFor(scope, counts),
    cells: cellsFor(scope, counts),
    // Filtered rather than merely written carefully: an action is a promise
    // that tapping it lands somewhere, and the scope table is the thing that
    // decides. A future section move must break the list, not the admin.
    actions: (ACTIONS[scope] ?? ACTIONS.full)
      .filter((a) => scopeCanOpen(scope, a.section))
      .map(({ section, tab, view, ...rest }) => ({
        ...rest,
        href: adminScreenHref(section, tab, view),
      })),
    accessNote: accessNoteFor(scope),
  };
}

// ---- Queues -----------------------------------------------------------

/** What the queue list actually renders: rows with something in them, whose
 *  destination this scope can open. The strip's "Needs you" figure is this
 *  same number, so the count and the list it sits above cannot disagree. */
export function visibleQueueTotal(groups: InboxGroup[], allowed: AdminSectionKey[]): number {
  return groups.reduce(
    (sum, g) =>
      sum + g.items.reduce((s, i) => s + (allowed.includes(i.section) ? i.count : 0), 0),
    0
  );
}

// Which queues a scope reads first. Ordering only -- nothing is removed
// here, because what a scope may work is the routes' decision and a UI that
// hid a reachable queue would be a second, disagreeing permission model.
// A finance admin may well approve a signup; they should just not have to
// scroll past the clinical queue to find the payout requests.
const QUEUE_ORDER: Record<AdminScope, AdminQueueDomain[]> = {
  // Page order already reads correctly for a full admin, so nothing moves.
  full: [],
  operations: ["scheduling", "approvals", "growth", "clinical", "money", "risk", "health"],
  finance: ["money", "approvals", "growth", "clinical", "scheduling", "risk", "health"],
  clinical: ["clinical", "scheduling", "approvals", "money", "growth", "risk", "health"],
};

/** The queue groups, this scope's own work first. Stable for anything the
 *  order does not name, so a new group added to the page appears in page
 *  order rather than vanishing or jumping to the top. */
export function orderQueueGroups(groups: InboxGroup[], scope: AdminScope): InboxGroup[] {
  const order = QUEUE_ORDER[scope] ?? [];
  if (order.length === 0) return groups;
  const rank = (g: InboxGroup) => {
    const i = order.indexOf(g.domain);
    return i === -1 ? order.length : i;
  };
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
    .map(({ g }) => g);
}
