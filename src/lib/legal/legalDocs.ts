// The public legal pages: Privacy, Terms, Refunds, Cookies, Medical
// disclaimer and Grievances. Content only -- no React -- so every document
// can be tested without rendering (see legalDocs.test.ts).
//
// DRAFT for the owner's lawyer to review; see legalFacts.ts. Two rules keep
// it honest:
//  - Say only what the app does. The cookie table lists the cookies the code
//    actually sets; the refund window and booking notice are the admin's live
//    settings, never typed in; deletion says what DATA-POLICY.md says.
//  - A fact the owner has not supplied is left out, never invented.

import { LEGAL_FACTS, type LegalFacts } from "@/lib/legal/legalFacts";

export type LegalBlock =
  | string
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } };

export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };

export type LegalDoc = {
  slug: LegalSlug;
  title: string;
  /** One line under the title: what this page is, in plain words. */
  summary: string;
  sections: LegalSection[];
};

export type LegalContext = {
  siteName: string;
  contactEmail: string;
  /** online_booking_lead_time_hours */
  leadTimeHours: number;
  /** online_cancellation_refund_hours */
  refundHours: number;
  facts?: LegalFacts;
};

export const LEGAL_PAGES = [
  { slug: "privacy", href: "/privacy", label: "Privacy policy" },
  { slug: "terms", href: "/terms", label: "Terms of use" },
  { slug: "refunds", href: "/refunds", label: "Refunds & cancellations" },
  { slug: "cookies", href: "/cookies", label: "Cookie policy" },
  { slug: "medical-disclaimer", href: "/medical-disclaimer", label: "Medical disclaimer" },
  { slug: "grievances", href: "/grievances", label: "Grievances" },
] as const;

export type LegalSlug = (typeof LEGAL_PAGES)[number]["slug"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "12 November 2026" from "2026-11-12". Parsed by hand rather than through
 * Date: a calendar date has no zone, and Date would read it as UTC midnight.
 */
export function formatEffectiveDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return "";
  return `${Number(m[3])} ${month} ${m[1]}`;
}

function hoursPhrase(hours: number): string {
  const n = Math.round(hours);
  return n === 1 ? "1 hour" : `${n} hours`;
}

/** The business named as the policy's owner: the legal entity when known. */
function whoWeAre(ctx: LegalContext, f: LegalFacts): string {
  const parts = [f.entityName.trim() ? `${ctx.siteName} is operated by ${f.entityName.trim()}` : `${ctx.siteName} is a physiotherapy practice`];
  if (f.registeredAddress.trim()) parts.push(`, registered at ${f.registeredAddress.trim()}`);
  if (f.registrationNumber.trim()) parts.push(` (${f.registrationNumber.trim()})`);
  return `${parts.join("")}. In these pages "we", "us" and "our" mean ${ctx.siteName}.`;
}

function grievanceContactLines(ctx: LegalContext, f: LegalFacts): string[] {
  const lines: string[] = [];
  if (f.grievanceOfficerName.trim()) lines.push(`Grievance Officer: ${f.grievanceOfficerName.trim()}`);
  const email = f.grievanceOfficerEmail.trim() || ctx.contactEmail.trim();
  if (email) lines.push(`Email: ${email}`);
  if (f.grievanceOfficerPhone.trim()) lines.push(`Phone: ${f.grievanceOfficerPhone.trim()}`);
  if (f.registeredAddress.trim()) lines.push(`Post: ${f.registeredAddress.trim()}`);
  return lines;
}

function contactSentence(ctx: LegalContext, f: LegalFacts): string {
  const email = f.grievanceOfficerEmail.trim() || ctx.contactEmail.trim();
  return email
    ? `Write to ${email}, or see the Grievances page for our Grievance Officer's details.`
    : "See the Grievances page for how to reach our Grievance Officer.";
}

function privacy(ctx: LegalContext, f: LegalFacts): LegalDoc {
  return {
    slug: "privacy",
    title: "Privacy policy",
    summary: "What we collect, why, who sees it, and how you stay in control of it.",
    sections: [
      {
        id: "who-we-are",
        heading: "Who we are",
        blocks: [
          whoWeAre(ctx, f),
          "We are the Data Fiduciary for the personal data described here, under India's Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and its rules.",
        ],
      },
      {
        id: "what-we-collect",
        heading: "What we collect",
        blocks: [
          { list: [
            "Account details: your name, email, phone number, and the role you sign up as (patient, therapist or hospital partner).",
            "Health information you give us or your therapist records: your health profile, the Pain Map, conditions and symptoms, medical reports you upload, assessments, care plans and session summaries. This is sensitive personal data and we treat it that way.",
            "Booking details: the sessions you book, for whom (yourself or someone in your care), times, and for home visits, the address and area of the visit.",
            "Payment details: amounts, payment status and refund status. Card, UPI and bank details are collected by Razorpay, our payment provider, and never reach our servers.",
            "Therapist and hospital partner details: qualifications, registration, availability, payout and bank details needed to pay you.",
            "Technical details: the country your connection comes from (to show prices in your currency), and the cookies described in our Cookie policy.",
            "Usage analytics on our public pages and the booking widget, only if you agree to it. Never inside your account.",
          ] },
        ],
      },
      {
        id: "why",
        heading: "Why we use it",
        blocks: [
          { list: [
            "To provide care: matching you with a therapist, running video and home-visit sessions, and keeping your clinical record.",
            "To take payments, issue refunds and pay therapists.",
            "To contact you about your bookings, by email, phone or WhatsApp.",
            "To keep the service safe: preventing fraud and misuse, and keeping an audit trail of who changed what.",
            "To meet our legal duties, such as keeping financial and clinical records.",
            "To improve our public website, using analytics only with your consent.",
          ] },
          "We use your health information only to care for you. We do not sell personal data, and we do not use it for advertising.",
        ],
      },
      {
        id: "consent",
        heading: "Your consent",
        blocks: [
          "We process your personal data on the basis of the consent you give when you create an account and when you book, and, where the law allows, for legitimate uses such as meeting a legal obligation or responding to a medical emergency.",
          "You can withdraw consent at any time by writing to us. Withdrawing does not undo what was done before, and we may no longer be able to provide sessions that depend on that data.",
          "If you book for a child or someone in your care, you confirm you are their parent or lawful guardian and consent on their behalf.",
        ],
      },
      {
        id: "who-sees-it",
        heading: "Who sees it",
        blocks: [
          "Inside our practice, only the people who need it: your assigned therapist sees your clinical record; our staff see what their role requires, and their access is logged. If a hospital referred you, that hospital sees what relates to the referral.",
          "We share data with service providers who process it for us, under contract:",
          { table: {
            head: ["Provider", "What for"],
            rows: [
              ["Supabase", "Hosting our database, sign-in and file storage"],
              ["Razorpay", "Taking payments and refunds"],
              ["Google", "Calendar and Meet links for video sessions; website analytics only with your consent"],
              ["Resend", "Sending account and booking emails"],
              ["WhatsApp (Meta)", "Only when you choose to message us there"],
            ],
          } },
          "We disclose data to authorities only when the law requires it.",
          "Some providers store data on servers outside India. Where they do, we rely on the transfer being permitted under Indian law and on the provider's own safeguards.",
        ],
      },
      {
        id: "how-long",
        heading: "How long we keep it",
        blocks: [
          "We keep your account data while your account is open. Clinical records, payment and refund records, and audit records are kept after that for as long as law and good clinical practice require, because they are records of care given and money moved.",
          "Reports you upload stay until you delete them or your account is removed.",
        ],
      },
      {
        id: "your-rights",
        heading: "Your rights",
        blocks: [
          "You can ask us to:",
          { list: [
            "tell you what personal data we hold about you and who we have shared it with;",
            "correct or complete data that is wrong or out of date;",
            "erase your data. We will close your account and remove your contact details; records we are legally obliged to keep (clinical, payment and audit) are kept, marked as belonging to a closed account;",
            "nominate someone to exercise these rights for you if you die or cannot act yourself;",
            "hear and resolve a complaint about how we handled your data.",
          ] },
          `${contactSentence(ctx, f)} If you are not satisfied with our answer, you can complain to the Data Protection Board of India.`,
        ],
      },
      {
        id: "security",
        heading: "How we protect it",
        blocks: [
          "Data is encrypted in transit, access is restricted by role at the database level, and staff access to records is logged. No system is perfectly secure; if a breach affects your data, we will tell you and the Data Protection Board as the law requires.",
        ],
      },
      {
        id: "outside-india",
        heading: "If you are outside India",
        blocks: [
          "We offer video sessions to patients in other countries. If you are in the European Economic Area or the United Kingdom, the GDPR (and the UK GDPR) also apply to how we handle your data, and this section adds to the rest of this policy.",
          { list: [
            "Lawful basis: we rely on your explicit consent for health data, on the contract with you to provide sessions and take payment, on legal obligation for financial records, and on our legitimate interests for keeping the service secure.",
            "Your extra rights: besides the rights above, you can ask for a copy of your data in a portable format, object to or restrict processing based on legitimate interests, and withdraw consent at any time.",
            "Transfers: your data is processed in India and by the providers listed above, some outside the EEA and UK. Where the law requires it, we rely on Standard Contractual Clauses or equivalent safeguards.",
            "Complaints: you can complain to the data protection authority where you live or work (in the UK, the Information Commissioner's Office).",
          ] },
          "Patients elsewhere have the rights their own law gives them; write to us and we will help.",
        ],
      },
      {
        id: "children",
        heading: "Children",
        blocks: [
          "Accounts are for adults. A child's sessions are booked by their parent or guardian, whose consent covers the child's data. We do not track children's behaviour or show them advertising.",
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        blocks: [
          "When we change this policy we update the date at the top of this page. If a change is significant, we will tell you by email or in your account before it applies.",
        ],
      },
    ],
  };
}

function terms(ctx: LegalContext, f: LegalFacts): LegalDoc {
  const courts = f.jurisdictionCity.trim()
    ? `the courts at ${f.jurisdictionCity.trim()}, India`
    : "the courts of India";
  return {
    slug: "terms",
    title: "Terms of use",
    summary: `The agreement between you and ${ctx.siteName} when you use this website and our services.`,
    sections: [
      {
        id: "about",
        heading: "About these terms",
        blocks: [
          whoWeAre(ctx, f),
          "By creating an account, booking a session or using this website, you agree to these terms, our Privacy policy and our Refunds & cancellations policy. If you do not agree, please do not use the service.",
        ],
      },
      {
        id: "service",
        heading: "What we provide",
        blocks: [
          "Physiotherapy assessment and treatment by qualified physiotherapists, by video consultation or, where offered, by a visit to your home. Programmes and session packages are sold as described on their page at the time you buy.",
          "Video sessions are not suitable for every condition. Your therapist may advise an in-person assessment, a scan or a doctor's visit instead.",
          "We are not an emergency service. In an emergency, call 112 or go to the nearest hospital.",
        ],
      },
      {
        id: "accounts",
        heading: "Your account",
        blocks: [
          { list: [
            "You must be 18 or over to hold an account. A parent or guardian books for a child.",
            "Give accurate information, including your health history: your care depends on it.",
            "Keep your sign-in private. You are responsible for what is done through your account.",
            "We may suspend an account that breaks these terms, puts a therapist at risk, or is used for fraud.",
          ] },
        ],
      },
      {
        id: "bookings",
        heading: "Bookings and payment",
        blocks: [
          `Online bookings need ${hoursPhrase(ctx.leadTimeHours)}' notice. A booking is confirmed once payment succeeds, or, where pay-later is offered to you, once we confirm it.`,
          "Prices are shown before you pay and include applicable taxes unless stated otherwise. Home visits may carry a travel fee, shown before you confirm.",
          "Payments are processed by Razorpay. For home visits where cash is accepted, you pay the therapist at the visit.",
          "Cancellations and refunds follow our Refunds & cancellations policy.",
        ],
      },
      {
        id: "sessions",
        heading: "During a session",
        blocks: [
          { list: [
            "Join video sessions on time, from a private, safe space with room to move.",
            "For home visits, make sure a responsible adult is present if the patient is a minor or needs help, and that the space is safe for the therapist.",
            "Treat therapists with respect. We will end a session, and may close an account, for abusive or unsafe behaviour.",
            "Do not record a session without the therapist's agreement.",
          ] },
        ],
      },
      {
        id: "therapists-partners",
        heading: "Therapists and hospital partners",
        blocks: [
          "Therapists and hospital partners also agree to the separate agreement we sign with them, which covers qualifications, conduct, confidentiality and payouts. Where it conflicts with these terms, that agreement wins.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "Acceptable use",
        blocks: [
          "Do not misuse the website: no attempts to access other people's data, disrupt the service, scrape it, upload harmful files, or impersonate anyone.",
        ],
      },
      {
        id: "content",
        heading: "Our content",
        blocks: [
          `The website, its text, design and exercise material belong to ${ctx.siteName} or its licensors. You may use them for your own care, not copy or sell them.`,
        ],
      },
      {
        id: "liability",
        heading: "Our responsibility to you",
        blocks: [
          "We take reasonable care in providing our services. Physiotherapy outcomes vary from person to person and we cannot guarantee a particular result.",
          "To the extent the law allows, we are not liable for indirect or consequential loss, and our total liability for any claim is limited to the amount you paid for the session or package concerned. Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence.",
        ],
      },
      {
        id: "law",
        heading: "Law and disputes",
        blocks: [
          `These terms are governed by the laws of India. Please raise any complaint with our Grievance Officer first; disputes that cannot be resolved are subject to the jurisdiction of ${courts}.`,
        ],
      },
      {
        id: "changes",
        heading: "Changes to these terms",
        blocks: [
          "We may update these terms. The date at the top shows the current version; continuing to use the service after a change means you accept it. A change never affects a booking already paid for.",
        ],
      },
    ],
  };
}

function refunds(ctx: LegalContext, f: LegalFacts): LegalDoc {
  const window = hoursPhrase(ctx.refundHours);
  return {
    slug: "refunds",
    title: "Refunds & cancellations",
    summary: "When you can cancel, what you get back, and how long it takes.",
    sections: [
      {
        id: "cancelling",
        heading: "Cancelling a session",
        blocks: [
          { list: [
            `Cancel at least ${window} before the session starts and you get a full refund.`,
            `Cancel less than ${window} before, or miss the session, and the session fee is not refunded, because the therapist's time was held for you.`,
            "You can cancel from your account. The cut-off for each session is shown there.",
          ] },
        ],
      },
      {
        id: "we-cancel",
        heading: "If we cancel",
        blocks: [
          "If we or your therapist cancel, or a session cannot go ahead because of a problem on our side, you get a full refund.",
        ],
      },
      {
        id: "packages",
        heading: "Programmes and packages",
        blocks: [
          "If you stop a programme or session package early, we refund the sessions not yet delivered, pro rata: the price you paid divided by the number of sessions, for each session not delivered. Sessions already delivered are not refundable. Write to us with the purchase concerned and we will process it.",
          "If we cannot provide a home visit you have paid for, we refund it in full.",
        ],
      },
      {
        id: "how-refunds-work",
        heading: "How refunds are paid",
        blocks: [
          "Refunds go back to the method you paid with, through Razorpay. Your bank usually shows them within 5 to 7 working days of our approval.",
          "Cash paid at a home visit is refunded by bank transfer or UPI to an account you nominate.",
          "If you have not paid yet (pay-later), cancelling in time means you owe nothing; a late cancellation or a missed session is still owed.",
        ],
      },
      {
        id: "questions",
        heading: "Questions",
        blocks: [contactSentence(ctx, f)],
      },
    ],
  };
}

function cookies(ctx: LegalContext): LegalDoc {
  return {
    slug: "cookies",
    title: "Cookie policy",
    summary: "The small files and browser storage this website uses, and your choices.",
    sections: [
      {
        id: "what",
        heading: "What cookies are",
        blocks: [
          "Cookies are small text files a website stores in your browser. We also use your browser's local storage for a few settings. Both are covered here.",
        ],
      },
      {
        id: "essential",
        heading: "Essential: always on",
        blocks: [
          "These make the website work. They do not track you and cannot be switched off here.",
          { table: {
            head: ["Name", "What it does", "How long"],
            rows: [
              ["sb-…-auth-token", "Keeps you signed in (Supabase)", "Until you sign out"],
              ["mr_profile_cache", "Remembers your account type so your dashboard opens quickly", "A few minutes"],
              ["mr_geo", "The country your connection comes from, to show prices in your currency", "30 days"],
              ["mr_country", "The country you picked in the footer", "1 year"],
              ["Razorpay", "Set by Razorpay's checkout while you pay, to process and protect the payment", "Razorpay's own policy"],
            ],
          } },
          "Our support staff's own browsers carry a few further cookies used while helping a patient; these are never set on yours.",
        ],
      },
      {
        id: "analytics",
        heading: "Analytics: only if you say yes",
        blocks: [
          "With your consent we use Google Analytics on our public pages and the booking widget, to see which pages help people and where booking gets stuck. It is never loaded inside your account, and we never send it your name, contact details or anything about your health.",
          { table: {
            head: ["Name", "What it does", "How long"],
            rows: [
              ["_ga", "Tells one visit from another (Google)", "Up to 2 years"],
              ["_ga_…", "Keeps the state of a visit (Google)", "Up to 2 years"],
            ],
          } },
          "Until you choose, nothing from Google loads at all.",
        ],
      },
      {
        id: "storage",
        heading: "Settings kept in your browser",
        blocks: [
          { table: {
            head: ["Name", "What it does"],
            rows: [
              ["mr_analytics_consent", "Your analytics choice"],
              ["mr_analytics_asked_at", "When we last asked, so we do not ask again too soon"],
              ["mr_ga_purchases", "Stops one payment being counted twice, if you allowed analytics"],
              ["Display preferences", "Things like a list's page size and the opening screen, so they stay as you left them"],
            ],
          } },
        ],
      },
      {
        id: "choices",
        heading: "Your choices",
        blocks: [
          "Change your analytics choice at any time with “Analytics settings” at the bottom of every page. Saying no removes Google's cookies.",
          "You can also delete cookies in your browser's settings. Deleting essential cookies signs you out.",
          `Questions? Write to ${ctx.contactEmail.trim() || "us"}.`,
        ],
      },
    ],
  };
}

function medicalDisclaimer(ctx: LegalContext): LegalDoc {
  return {
    slug: "medical-disclaimer",
    title: "Medical disclaimer",
    summary: "What our website and our sessions can and cannot do.",
    sections: [
      {
        id: "information",
        heading: "Website information is general",
        blocks: [
          `Articles, exercise examples and condition descriptions on this website are general information, not a diagnosis or a treatment plan for you. Do not start, stop or change a treatment because of them without speaking to a qualified professional.`,
        ],
      },
      {
        id: "physiotherapy",
        heading: "Physiotherapy, not a doctor's care",
        blocks: [
          `${ctx.siteName}'s therapists are physiotherapists. They do not prescribe medicines or replace your doctor. If your therapist advises you to see a doctor, get a scan, or attend in person, please do.`,
          "Video sessions rely on what can be seen and described on camera. Your therapist will tell you if your condition needs a hands-on assessment.",
        ],
      },
      {
        id: "safety",
        heading: "Exercise safely",
        blocks: [
          "Stop an exercise and tell your therapist if it causes sharp pain, dizziness, chest pain or breathlessness. Results vary between people and are not guaranteed.",
        ],
      },
      {
        id: "emergencies",
        heading: "Emergencies",
        blocks: [
          "We are not an emergency service. For chest pain, sudden weakness or numbness, a fall with a head injury, or any emergency, call 112 or go to the nearest hospital.",
        ],
      },
    ],
  };
}

function grievances(ctx: LegalContext, f: LegalFacts): LegalDoc {
  const lines = grievanceContactLines(ctx, f);
  return {
    slug: "grievances",
    title: "Grievances",
    summary: "How to raise a complaint, including about your personal data, and what happens next.",
    sections: [
      {
        id: "officer",
        heading: "Our Grievance Officer",
        blocks: [
          "Complaints about our services, a payment, or how we handle your personal data go to our Grievance Officer, appointed under the Information Technology Act, 2000, the Consumer Protection (E-Commerce) Rules, 2020 and the Digital Personal Data Protection Act, 2023.",
          ...(lines.length ? [{ list: lines }] : []),
        ],
      },
      {
        id: "what-to-include",
        heading: "What to include",
        blocks: [
          { list: [
            "Your name and the email or phone number on your account.",
            "The booking or payment concerned, if any.",
            "What happened, and what you would like us to do.",
          ] },
          "Please do not send medical reports by email; they are safer uploaded to your account.",
        ],
      },
      {
        id: "timelines",
        heading: "What happens next",
        blocks: [
          { list: [
            "We acknowledge your complaint within 48 hours.",
            "We aim to resolve it within 30 days, and will tell you if we need longer and why.",
          ] },
          "If you are not satisfied with our answer about your personal data, you can complain to the Data Protection Board of India. For other complaints, you can approach the National Consumer Helpline (1915) or the consumer commission.",
        ],
      },
    ],
  };
}

export function legalDoc(slug: LegalSlug, ctx: LegalContext): LegalDoc {
  const f = ctx.facts ?? LEGAL_FACTS;
  switch (slug) {
    case "privacy":
      return privacy(ctx, f);
    case "terms":
      return terms(ctx, f);
    case "refunds":
      return refunds(ctx, f);
    case "cookies":
      return cookies(ctx);
    case "medical-disclaimer":
      return medicalDisclaimer(ctx);
    case "grievances":
      return grievances(ctx, f);
  }
}
