/**
 * The dashboard tutorial: what each role is walked through, in what order,
 * and which section of the dashboard each chapter explains.
 *
 * A first visit to a patient, therapist or hospital dashboard opens the
 * whole tutorial over the page. It plays animated scenes built from
 * **dummy data** (the fixtures below) -- never the person's own rows, and
 * never written anywhere -- and fades away to the real dashboard on Done.
 * Every page title, and the cards that hold a state machine worth
 * explaining, carry an (i) that opens just the chapter for that section.
 *
 * This module is the content and the lookups, dependency-free and tested:
 * which chapter a page's (i) opens is a judgement, and an (i) that opened
 * the wrong chapter -- or none -- would be worse than no button. The
 * animation lives in `src/components/tutorial/`; each step names the scene
 * it plays by `scene`, and the scene registry there must cover every one
 * (the test below and `TutorialScenes` both check).
 *
 * The words describe the product as it behaves, and they are the same
 * words the screens use ("waiting for a therapist", "Waiting for the clinic
 * to approve", "Onboarding needed") so a person meets them twice: once here
 * with nothing at stake, and again on their own data.
 */

export type TutorialRole = "patient" | "therapist" | "hospital";

export const TUTORIAL_SCENES = [
  "welcome",
  "patient-feed",
  "patient-book",
  "patient-journey",
  "patient-suggested",
  "patient-programme",
  "patient-payments",
  "patient-hp-locked",
  "patient-hp-ready",
  "patient-hp-update",
  "patient-profile",
  "info-button",
  "therapist-feed",
  "therapist-availability",
  "therapist-session",
  "therapist-hp-triage",
  "therapist-hp-intake",
  "therapist-hp-exam",
  "therapist-hp-recommend",
  "therapist-hp-updates",
  "therapist-earnings",
  "therapist-profile",
  "onboard-overview",
  "onboard-prepare",
  "onboard-triage",
  "onboard-ortho",
  "onboard-neuro",
  "onboard-paeds",
  "onboard-save",
  "onboard-change",
  "hospital-feed",
  "hospital-refer",
  "hospital-referrals",
  "hospital-earnings",
  "hospital-profile",
  "finish",
] as const;

export type TutorialScene = (typeof TUTORIAL_SCENES)[number];

export type TutorialStep = {
  id: string;
  scene: TutorialScene;
  title: string;
  body: string;
  /** Short "what this means for you" lines under the body. */
  points?: string[];
};

export type TutorialChapter = {
  id: string;
  title: string;
  icon: string;
  /** Dashboard sections whose (i) opens this chapter: the route segment
   *  after the role's dashboard path ("" is the overview), or a card key
   *  such as "card:session-status". */
  sections: string[];
  steps: TutorialStep[];
};

/** The dummy people and numbers every scene uses. One cast, so the story
 *  hangs together from chapter to chapter. */
export const TUTORIAL_FIXTURES = {
  patient: "Priya Sharma",
  patientShort: "Priya",
  patientCode: "PT0042",
  therapist: "Dr Ananya Rao",
  therapistShort: "Dr Ananya",
  hospital: "City Care Hospital",
  sessionCode: "SS0128",
  programmeCode: "SP0016",
  condition: "Lower back pain",
  when: "Mon 14 Oct, 6:00 PM",
  whenNext: "Thu 17 Oct, 6:00 PM",
  price: "₹1,799",
  programme: "Back Pain Recovery - 6 sessions",
  programmePrice: "₹9,594",
  share: 60,
} as const;

const F = TUTORIAL_FIXTURES;

const PATIENT: TutorialChapter[] = [
  {
    id: "patient-welcome",
    title: "Welcome",
    icon: "fa-hand-sparkles",
    sections: [],
    steps: [
      {
        id: "welcome",
        scene: "welcome",
        title: "Welcome to your dashboard",
        body: "A two-minute tour with a pretend patient, Priya, so you can see how everything works before you use it. None of this is your data.",
        points: ["Use Next and Back, or your arrow keys.", "Tap any chapter at the top to jump to it."],
      },
    ],
  },
  {
    id: "patient-overview",
    title: "Home",
    icon: "fa-gauge-high",
    sections: [""],
    steps: [
      {
        id: "feed",
        scene: "patient-feed",
        title: "Home tells you what's happening",
        body: "Every update about your care lands here, newest first. Anything that needs you is marked so you can't miss it.",
        points: [
          "Amber items need something from you - a payment, a time to pick.",
          "Green items are good news - a session confirmed, a profile ready.",
          "Tap any item to go straight to it.",
        ],
      },
    ],
  },
  {
    id: "patient-booking",
    title: "Booking a session",
    icon: "fa-calendar-plus",
    sections: ["book", "sessions", "card:session-status"],
    steps: [
      {
        id: "book",
        scene: "patient-book",
        title: "Book in four taps",
        body: "Pick what you need help with, video or a home visit, a day and a time - then pay securely. You can add a promo code before paying.",
      },
      {
        id: "journey",
        scene: "patient-journey",
        title: "What happens after you pay",
        body: "Watch Priya's session move through each stage. Yours will show the same labels on Home and under Sessions.",
        points: [
          `"Waiting for a therapist" - paid, and the clinic is choosing the right therapist for you.`,
          `"Confirmed with ${F.therapistShort}" - your therapist and time are set.`,
          `"Tap to Join" - lights up shortly before a video session starts.`,
          `"Completed" - afterwards you can rate the session.`,
        ],
      },
      {
        id: "unpaid",
        scene: "patient-journey",
        title: "If a payment doesn't go through",
        body: `You'll see "Payment not completed". The session isn't booked until it's paid - tap Pay now to finish exactly where you left off, with your details and code already filled in.`,
      },
    ],
  },
  {
    id: "patient-suggested",
    title: "Suggested times",
    icon: "fa-lightbulb",
    sections: ["suggested"],
    steps: [
      {
        id: "suggested",
        scene: "patient-suggested",
        title: "Your therapist can suggest your next session",
        body: `After a session, your therapist may suggest a time for the next one. Tap "Accept this time" to book it in one go, or Decline and pick your own.`,
      },
    ],
  },
  {
    id: "patient-programmes",
    title: "Programmes",
    icon: "fa-layer-group",
    sections: ["packages", "card:care-plan"],
    steps: [
      {
        id: "programme",
        scene: "patient-programme",
        title: "A programme is a course of sessions",
        body: `When your therapist recommends one, the clinic checks it first and then it appears as "Your therapist recommended a programme". Accept it to pay once for every session.`,
        points: [
          `Then you'll see "6 sessions still to book" - pick each time whenever it suits you.`,
        ],
      },
    ],
  },
  {
    id: "patient-payments",
    title: "Payments",
    icon: "fa-receipt",
    sections: ["payments", "card:refund"],
    steps: [
      {
        id: "payments",
        scene: "patient-payments",
        title: "Every payment and refund in one list",
        body: "Download a receipt for anything you've paid. If a session is cancelled in time, the refund shows here too.",
        points: [
          `"${F.price} refunded" - it's on its way back to the card or account you paid with.`,
          `"Refund delayed - our team is sending it by hand" - it didn't go through automatically, and nothing is needed from you.`,
        ],
      },
    ],
  },
  {
    id: "patient-health-profile",
    title: "Health profile",
    icon: "fa-file-medical",
    sections: ["health-profile", "card:health-profile"],
    steps: [
      {
        id: "hp-locked",
        scene: "patient-hp-locked",
        title: "Your therapist starts your health profile with you",
        body: "At your first session, your therapist asks about your condition and fills in your health profile together with you. Until then it's read-only.",
        points: [
          "You don't need to fill anything in before your first session.",
          "You can upload scans and reports right now - your therapist will see them.",
        ],
      },
      {
        id: "hp-ready",
        scene: "patient-hp-ready",
        title: `"Your health profile is ready"`,
        body: "Once your therapist has filled it in, you'll get this update on Home and the profile opens to you.",
        points: [
          "Your answers about your condition, in your therapist's words and yours.",
          "The Pain Map - where it hurts and how much, from each exam.",
          `"Are you getting better?" - one point per exam, so you can see your progress.`,
        ],
      },
      {
        id: "hp-update",
        scene: "patient-hp-update",
        title: "Something changed? Update it",
        body: `Edit your answers and send them. They show as "Waiting for the clinic to approve" - your therapist keeps seeing the previous answers until the clinic approves the new ones.`,
        points: [
          `Approved - "Health profile approved", and your therapist sees the new answers.`,
          `If something needs fixing it "came back with a note" - open it, fix it and resend.`,
        ],
      },
    ],
  },
  {
    id: "patient-profile",
    title: "Your details",
    icon: "fa-user-pen",
    sections: ["profile"],
    steps: [
      {
        id: "profile",
        scene: "patient-profile",
        title: "Your details and addresses",
        body: "Keep your phone number and email up to date so your therapist can reach you. Save addresses for home visits, and change your password here.",
      },
    ],
  },
  {
    id: "patient-finish",
    title: "You're ready",
    icon: "fa-circle-check",
    sections: [],
    steps: [
      {
        id: "info",
        scene: "info-button",
        title: "Help is always one tap away",
        body: "Look for the (i) beside every page title and on important cards. Tap it to replay just that part of this tour.",
      },
      {
        id: "finish",
        scene: "finish",
        title: "That's everything",
        body: "Tap Done to see your own dashboard. Your first step: book a session - your health profile starts there.",
      },
    ],
  },
];

const THERAPIST: TutorialChapter[] = [
  {
    id: "therapist-welcome",
    title: "Welcome",
    icon: "fa-hand-sparkles",
    sections: [],
    steps: [
      {
        id: "welcome",
        scene: "welcome",
        title: "Welcome to your dashboard",
        body: `A short tour with a pretend patient, ${F.patient}, so you know where everything is before your first real session. None of this is real data.`,
        points: ["Use Next and Back, or your arrow keys.", "Tap any chapter at the top to jump to it."],
      },
    ],
  },
  {
    id: "therapist-overview",
    title: "Home",
    icon: "fa-gauge-high",
    sections: [""],
    steps: [
      {
        id: "feed",
        scene: "therapist-feed",
        title: "Home is your to-do list",
        body: "New patients, upcoming sessions, sessions to mark complete and payouts all land here. Items marked as needing you come first.",
        points: [
          `"Onboarding needed" - a new patient's health profile is waiting for you to start it.`,
          `"Finished - mark it complete" - you're only paid for sessions marked complete.`,
        ],
      },
    ],
  },
  {
    id: "therapist-availability",
    title: "Availability",
    icon: "fa-calendar-week",
    sections: ["availability"],
    steps: [
      {
        id: "availability",
        scene: "therapist-availability",
        title: "Set your weekly hours",
        body: "The clinic only offers you sessions inside the hours you set here. Add one-off changes for a single day, and mark yourself on leave when you're away.",
        points: ["No hours means no sessions can be offered to you.", "Leave hides you from new bookings until you're back."],
      },
    ],
  },
  {
    id: "therapist-sessions",
    title: "Sessions",
    icon: "fa-calendar-check",
    sections: ["sessions", "card:session-status"],
    steps: [
      {
        id: "session",
        scene: "therapist-session",
        title: "Join, then mark complete",
        body: "Tap Join for a video session when it's time. Afterwards, mark it complete and write a short session note - only clinicians ever see notes.",
        points: ["Marking complete is what makes the session count towards your earnings."],
      },
    ],
  },
  {
    id: "therapist-health-profile",
    title: "Health profiles",
    icon: "fa-file-medical",
    sections: ["health-profile", "card:health-profile"],
    steps: [
      {
        id: "triage",
        scene: "therapist-hp-triage",
        title: "1. Start with four questions",
        body: `When a new patient is assigned to you, Home shows "Onboarding needed - ${F.patientShort}". Open their profile and answer four quick questions - they suggest a condition type with the reason shown. You decide.`,
        points: ["Orthopaedic, Neurological or Paediatric - each has its own question set."],
      },
      {
        id: "intake",
        scene: "therapist-hp-intake",
        title: "2. Fill their health profile with them",
        body: "Ask the condition type's questions during the first session and fill them in. This first fill saves straight away - no review.",
        points: [
          `The patient's own profile is locked until you do this. Afterwards they get "Your health profile is ready".`,
        ],
      },
      {
        id: "exam",
        scene: "therapist-hp-exam",
        title: "3. Record each exam on the Pain Map",
        body: "Mark where it hurts and how much at each exam. Every exam becomes one point on the patient's progress chart.",
      },
      {
        id: "recommend",
        scene: "therapist-hp-recommend",
        title: "4. Recommend what's next",
        body: "From your session note, recommend a programme. The clinic reviews and prices it, then the patient sees it and decides.",
        points: [
          "Approved, approved with changes, or turned down with a reason - you'll see which on Home.",
          `"${F.patientShort} accepted your recommendation" means their sessions are ready to book.`,
        ],
      },
      {
        id: "updates",
        scene: "therapist-hp-updates",
        title: "Later changes go through the clinic",
        body: `After the first fill, changes - yours or the patient's - wait for the clinic to approve. You keep seeing the previous answers until then.`,
        points: [`Need to edit a record? Request edit access - it says "Waiting on the clinic to approve it" until it's granted.`],
      },
    ],
  },
  {
    id: "therapist-earnings",
    title: "Earnings",
    icon: "fa-chart-line",
    sections: ["earnings", "card:earnings"],
    steps: [
      {
        id: "earnings",
        scene: "therapist-earnings",
        title: "Your share of every completed session",
        body: `Each completed session pays your share of its fee - ${F.share}% in this example. Request a payout when you're ready; it shows as pending until the clinic sends it.`,
      },
    ],
  },
  {
    id: "therapist-profile",
    title: "Your profile",
    icon: "fa-id-card",
    sections: ["profile"],
    steps: [
      {
        id: "profile",
        scene: "therapist-profile",
        title: "What patients see about you",
        body: "Your photo, languages and bio show on the Our Team page and save straight away. Your name, qualifications and specialisation need the clinic's approval - patients rely on them.",
      },
    ],
  },
  {
    id: "therapist-finish",
    title: "You're ready",
    icon: "fa-circle-check",
    sections: [],
    steps: [
      {
        id: "info",
        scene: "info-button",
        title: "Help is always one tap away",
        body: "Look for the (i) beside every page title and on important cards. Tap it to replay just that part of this tour.",
      },
      {
        id: "finish",
        scene: "finish",
        title: "That's everything",
        body: "Tap Done to see your own dashboard. Your first step: set your weekly hours so sessions can be offered to you.",
      },
    ],
  },
];

const HOSPITAL: TutorialChapter[] = [
  {
    id: "hospital-welcome",
    title: "Welcome",
    icon: "fa-hand-sparkles",
    sections: [],
    steps: [
      {
        id: "welcome",
        scene: "welcome",
        title: "Welcome to your partner dashboard",
        body: `A short tour with a pretend referral for ${F.patient}, so you can see how referring works end to end. None of this is real data.`,
        points: ["Use Next and Back, or your arrow keys.", "Tap any chapter at the top to jump to it."],
      },
    ],
  },
  {
    id: "hospital-overview",
    title: "Home",
    icon: "fa-gauge-high",
    sections: [""],
    steps: [
      {
        id: "feed",
        scene: "hospital-feed",
        title: "Home shows what happened to your referrals",
        body: "Every referral you send, and every decision on it, shows here newest first.",
      },
    ],
  },
  {
    id: "hospital-refer",
    title: "Refer a patient",
    icon: "fa-user-plus",
    sections: ["refer"],
    steps: [
      {
        id: "refer",
        scene: "hospital-refer",
        title: "Refer in under a minute",
        body: "Enter the patient's name and phone, how they'd like to be seen, their medical issue and the treatment they need. The clinic takes it from there - you don't need to book anything.",
      },
    ],
  },
  {
    id: "hospital-referrals",
    title: "Referral status",
    icon: "fa-list-check",
    sections: ["referrals", "card:referral-status"],
    steps: [
      {
        id: "statuses",
        scene: "hospital-referrals",
        title: "Follow each referral",
        body: "Watch a referral move through each stage. Yours show the same labels under Referrals.",
        points: [
          `"Pending Review" - the clinic is looking at it.`,
          `"Therapist Assigned" - a therapist has been chosen.`,
          `"Registration Link Sent" - the patient has a link to sign up.`,
          `"Registered" - the patient has joined and can book.`,
          `"Declined" comes with the clinic's reason. "Withdrawn" is one you took back.`,
        ],
      },
    ],
  },
  {
    id: "hospital-earnings",
    title: "Earnings",
    icon: "fa-indian-rupee-sign",
    sections: ["revenue", "card:earnings"],
    steps: [
      {
        id: "earnings",
        scene: "hospital-earnings",
        title: "Your share of referred patients' sessions",
        body: "Every completed session for a patient you referred earns your agreed share. A session keeps the rate that applied on the day it was delivered.",
      },
    ],
  },
  {
    id: "hospital-profile",
    title: "Your organisation",
    icon: "fa-hospital",
    sections: ["profile"],
    steps: [
      {
        id: "profile",
        scene: "hospital-profile",
        title: "Your organisation's details",
        body: "Keep your logo, contact details and how you'd like to be contacted up to date.",
      },
    ],
  },
  {
    id: "hospital-finish",
    title: "You're ready",
    icon: "fa-circle-check",
    sections: [],
    steps: [
      {
        id: "info",
        scene: "info-button",
        title: "Help is always one tap away",
        body: "Look for the (i) beside every page title and on important cards. Tap it to replay just that part of this tour.",
      },
      {
        id: "finish",
        scene: "finish",
        title: "That's everything",
        body: "Tap Done to see your own dashboard. Your first step: refer a patient.",
      },
    ],
  },
];

/**
 * Guides: chapters opened only from their own button, never part of the
 * first-visit tour (which would grow by eight steps for a task some
 * therapists meet weeks later). Opened by `openTour(GUIDE_SECTION...)`, the
 * same stage and controls as any (i).
 */
export const ONBOARDING_GUIDE_SECTION = "guide:onboarding";

const ONBOARDING_GUIDE: TutorialChapter = {
  id: "therapist-onboarding-guide",
  title: "How onboarding works",
  icon: "fa-clipboard-question",
  sections: [ONBOARDING_GUIDE_SECTION],
  steps: [
    {
      id: "overview",
      scene: "onboard-overview",
      title: "What onboarding is",
      body: `A new patient has no Health Profile until you start one. Onboarding is that first fill: four questions to decide the condition type, then that type's own questions, asked with the patient in your first session.`,
      points: [
        `Until it's done, Home and the session card say "Onboarding needed", and the patient's own Health Profile stays locked.`,
        "It takes about ten minutes. Do it in the first session, not after it.",
      ],
    },
    {
      id: "prepare",
      scene: "onboard-prepare",
      title: "Before the session",
      body: "Open the patient's Health Profile from the session card. Read any reports they uploaded - they can add those before onboarding. Then keep the first ten minutes of the session for these questions.",
      points: [
        "Ask in the patient's words, and type their answers in theirs. The help line under each question is written to be read aloud.",
        "For a child, a parent or carer answers. You record who spoke for them first.",
      ],
    },
    {
      id: "triage",
      scene: "onboard-triage",
      title: "Step 1 - four questions decide the condition type",
      body: "Age, what brought them in, any neurological signs, and - for a child only - any concern about milestones. From those the app suggests Orthopaedic, Neurological or Paediatric, and shows why. You confirm it or pick another.",
      points: [
        "A child with a milestone or from-birth concern: Paediatric. Under 18 on its own is not.",
        "After a stroke or brain or spinal injury, a long-term neurological condition, or any neurological sign: Neurological.",
        "Everything else - injury, surgery, a long-standing ache: Orthopaedic.",
      ],
    },
    {
      id: "ortho",
      scene: "onboard-ortho",
      title: "Orthopaedic - the pain questions",
      body: "Seven questions: the main issue, how long, severity today, where it hurts on the body figure, what makes it worse, what helps, anything else. The first three are required.",
      points: [
        "Orthopaedic only: record the Pain Map exam in the same session. Done needs it before the session can close.",
      ],
    },
    {
      id: "neuro",
      scene: "onboard-neuro",
      title: "Neurological - function and safety",
      body: "Seven questions: the condition and when it started, the affected side, how they move indoors, day-to-day independence, symptoms present, falls in the last three months, and their main goal. The first four are required.",
      points: ["The onset date matters as much as the diagnosis, and falls shape the plan more than almost anything else."],
    },
    {
      id: "paeds",
      scene: "onboard-paeds",
      title: "Paediatric - the parent answers",
      body: "First, who is answering and how they're related to the child. Then seven questions: the main concern, birth history, milestones the child manages today, any diagnosis or tests, equipment, the hardest part of a normal day, and the family's goal. The first three are required.",
      points: ["Milestones are ticked for what the child does on their own today, even if it's wobbly."],
    },
    {
      id: "save",
      scene: "onboard-save",
      title: "Save - it's live straight away",
      body: `Answers save as a draft as you go, so a dropped call loses nothing - reopening picks up where you stopped. Saving puts the record live with no clinic review, and the patient sees "Your health profile is ready".`,
      points: [`"Onboarding needed" leaves Home and the session card as soon as it's saved.`],
    },
    {
      id: "change",
      scene: "onboard-change",
      title: "If the case turns out to be something else",
      body: `Use "Change condition type" on their Health Profile: the four questions again, then the new type's set. It's your clinical call, so it saves straight away too.`,
      points: [
        `Editing answers later is different: request edit access, and changes wait for the clinic to approve them.`,
      ],
    },
  ],
};

const GUIDES: Record<TutorialRole, TutorialChapter[]> = {
  patient: [],
  therapist: [ONBOARDING_GUIDE],
  hospital: [],
};

const TUTORIALS: Record<TutorialRole, TutorialChapter[]> = {
  patient: PATIENT,
  therapist: THERAPIST,
  hospital: HOSPITAL,
};

export function tutorialFor(role: TutorialRole): TutorialChapter[] {
  return TUTORIALS[role];
}

/** The chapter an (i) for this section opens, or null when no chapter
 *  covers it (the caller then opens the whole tour). */
export function chapterForSection(role: TutorialRole, section: string): TutorialChapter | null {
  return (
    TUTORIALS[role].find((c) => c.sections.includes(section)) ??
    GUIDES[role].find((c) => c.sections.includes(section)) ??
    null
  );
}

const ROLE_BASE: Record<TutorialRole, string> = {
  patient: "/patient/dashboard",
  therapist: "/therapist/dashboard",
  hospital: "/hospital/dashboard",
};

/** Which role's dashboard a path belongs to, or null for any other page. */
export function tutorialRoleForPath(pathname: string): TutorialRole | null {
  for (const role of Object.keys(ROLE_BASE) as TutorialRole[]) {
    const base = ROLE_BASE[role];
    if (pathname === base || pathname.startsWith(`${base}/`)) return role;
  }
  return null;
}

/** The section a dashboard path is: the first segment after the role's
 *  dashboard path, "" for the overview. `/therapist/dashboard/health-profile/abc`
 *  is "health-profile". */
export function tutorialSectionForPath(pathname: string): string | null {
  const role = tutorialRoleForPath(pathname);
  if (!role) return null;
  const rest = pathname.slice(ROLE_BASE[role].length).replace(/^\/+/, "");
  return rest.split("/")[0] ?? "";
}

/** Total steps, for the progress line. */
export function tutorialStepCount(chapters: TutorialChapter[]): number {
  return chapters.reduce((n, c) => n + c.steps.length, 0);
}

/** Feed item id prefixes (src/lib/dashboardFeed.ts) to the card section
 *  whose chapter explains them, and the step to open on when one step is
 *  about exactly that update. Longest prefix first, since `appt-done-` and
 *  `care-plan-answer-` share a stem with shorter ones. */
const FEED_SECTIONS: [prefix: string, section: string, step?: string][] = [
  ["care-plan-decision-", "card:health-profile", "recommend"],
  ["care-plan-answer-", "card:health-profile", "recommend"],
  ["awaiting-recommendation-", "card:health-profile", "recommend"],
  ["appt-done-", "card:session-status"],
  ["unscheduled-", "card:care-plan"],
  ["care-plan-", "card:care-plan"],
  ["paylater-", "card:session-status", "journey"],
  ["onboard-", "card:health-profile", "triage"],
  ["payout-", "card:earnings"],
  ["refund-", "card:refund"],
  ["grant-", "card:health-profile", "updates"],
  ["cond-", "card:health-profile"],
  ["appt-", "card:session-status", "journey"],
  ["pay-", "card:session-status", "unpaid"],
  ["ref-", "card:referral-status"],
];

/** The card section a Home feed item belongs to, so its (i) can explain
 *  exactly that kind of update; null for items no chapter covers. */
export function tutorialSectionForFeedItem(id: string): string | null {
  return FEED_SECTIONS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null;
}

/** The step a feed item's (i) opens on, when one is more specific than the
 *  chapter's start. A step id the role's chapter lacks is ignored. */
export function tutorialStepForFeedItem(id: string): string | undefined {
  return FEED_SECTIONS.find(([prefix]) => id.startsWith(prefix))?.[2];
}
