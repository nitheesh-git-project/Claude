// "Why choose us" and "The real benefits": the two bands above the mission
// and vision, on the home page (short) and on /mission (in full).
//
// Every line is a claim the product itself keeps -- a health profile per
// specialty, the Pain Map and session notes, video or a home visit, the
// language picked at booking, the price quoted before paying -- so none of it
// can drift into a promise the platform does not make. The deliberate
// difference from "What we promise" (src/lib/mission.ts): those are rules
// the platform enforces; these are the reasons a person would pick it.
//
// No figure that an admin sets is written here (the refund window, the lead
// time): those live in site_settings, and a number in marketing copy is the
// first thing to go stale when one changes.

export type WhyItem = {
  key: string;
  icon: string;
  title: string;
  /** One line: what the home page shows. */
  line: string;
  /** How the platform actually does it: added on /mission. */
  detail: string;
};

export type BenefitItem = {
  key: string;
  title: string;
  line: string;
  detail: string;
};

export const WHY_CHOOSE_US: WhyItem[] = [
  {
    key: "physios",
    icon: "fa-user-doctor",
    title: "Qualified physiotherapists",
    line: "A physiotherapist runs every session. Never a bot, never a video course.",
    detail:
      "Each therapist's credentials are checked before they can see a single patient, and you can read their profile before you book.",
  },
  {
    key: "profile",
    icon: "fa-notes-medical",
    title: "A profile for your kind of care",
    line: "Orthopaedic, neurological and paediatric care each ask what matters for them.",
    detail:
      "Your health profile is built for your specialty, so the questions about a sore knee are not the questions about a stroke or a growing child.",
  },
  {
    key: "plan",
    icon: "fa-clipboard-check",
    title: "A plan written for you",
    line: "Your exercises come from your assessment, not a template.",
    detail:
      "After watching you move, your physiotherapist writes a care plan with the sessions and exercises you need - and changes it as you change.",
  },
  {
    key: "progress",
    icon: "fa-chart-line",
    title: "Progress you can see",
    line: "Pain scores, the Pain Map and session notes show how you are changing.",
    detail:
      "Mark where it hurts on the Pain Map, rate it, and see every session's notes in one place - the same record your physiotherapist works from.",
  },
  {
    key: "modes",
    icon: "fa-house-medical",
    title: "Screen or doorstep",
    line: "Video from anywhere, or the same team at your home.",
    detail:
      "Start on video, or book a home visit where we cover your pincode - confirmed before you pay, and paid online or, where offered, in cash at the door.",
  },
  {
    key: "language",
    icon: "fa-language",
    title: "In your language",
    line: "Choose the language you are most at ease in when you book.",
    detail:
      "Describing pain is hard enough. Pick your language at booking and it is used to match you with a physiotherapist who speaks it.",
  },
];

export const REAL_BENEFITS: BenefitItem[] = [
  {
    key: "no-travel",
    title: "No travel, no waiting room",
    line: "Nothing to drive to on the days it hurts to move.",
    detail:
      "Join from your sofa, your office or a hotel room. The time you would spend getting to a clinic goes into your recovery instead.",
  },
  {
    key: "your-time",
    title: "Times that fit your day",
    line: "Book a slot that suits you, in your own timezone.",
    detail:
      "Early mornings, lunch breaks, evenings: pick the hour that works, and it is shown in your own timezone so nothing gets lost in translation.",
  },
  {
    key: "expert-eyes",
    title: "Expert eyes on your form",
    line: "A physiotherapist watches you move and corrects it as you go.",
    detail:
      "Most exercises fail on technique, not effort. Being watched live is what turns a sheet of exercises into ones that work.",
  },
  {
    key: "clear-price",
    title: "Clear, upfront pricing",
    line: "You see the full price before you pay, with nothing added later.",
    detail:
      "Discounts are applied before checkout, and cancelling in good time gets your money back - the window is stated on the booking screen.",
  },
  {
    key: "adapts",
    title: "A plan that keeps up with you",
    line: "Your plan changes as you do, session to session.",
    detail:
      "Each session's notes feed the next one, so the plan moves on when you are ready rather than when a template says so.",
  },
  {
    key: "keep-going",
    title: "Easier to keep going",
    line: "Sessions, plan and notes live in one dashboard.",
    detail:
      "Recovery is won by turning up. Everything you need for the next session is in one place, with the same physiotherapist each time.",
  },
];
