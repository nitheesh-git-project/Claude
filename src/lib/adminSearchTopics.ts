// The admin's top search finds screens as well as people and sessions.
//
// A screen's own label is often not the word somebody types: promo codes
// live on Money -> Costs, the refund window on Settings -> Booking Rules,
// and nobody looks for "Offers & Discounts" when what they want is a
// coupon. So every screen is found by its label, its section and its
// description, and the things people actually come looking for are listed
// here with the words they use. Each entry names the screen it lives on;
// the search only offers screens the viewer's scope can open.
//
// Dependency-free and unit-tested (adminSearchTopics.test.ts checks that
// every entry points at a real screen).

import type { AdminSectionKey } from "@/lib/adminNav";

export type AdminSearchTopic = {
  /** What the result says. */
  label: string;
  section: AdminSectionKey;
  tab: string;
  /** Other words for it, lower case. */
  keywords: string[];
};

export const ADMIN_SEARCH_TOPICS: AdminSearchTopic[] = [
  { label: "Promo codes", section: "money", tab: "costs", keywords: ["promo", "promo code", "coupon", "discount code", "voucher", "campaign code", "offer code"] },
  { label: "First-session offer", section: "settings", tab: "offers", keywords: ["first session", "new patient discount", "welcome offer", "intro offer"] },
  { label: "Invite rewards", section: "settings", tab: "offers", keywords: ["invite", "referral reward", "refer a friend", "reward"] },
  { label: "Goodwill discount on one session", section: "sessions", tab: "all", keywords: ["goodwill", "money off a session", "reduce price"] },
  { label: "Refunds", section: "money", tab: "refunds", keywords: ["refund", "rfnd_", "money back", "refunded on razorpay"] },
  { label: "Payments", section: "money", tab: "transactions", keywords: ["payment", "razorpay", "pay_", "order_", "transaction", "receipt", "captured"] },
  { label: "Therapist payouts", section: "money", tab: "payouts", keywords: ["payout", "pay therapist", "therapist owed", "settle", "bank transfer"] },
  { label: "Pay later and what patients owe", section: "money", tab: "owing", keywords: ["pay later", "owed", "due", "credit", "write off", "unpaid"] },
  { label: "Booking lead time", section: "settings", tab: "booking", keywords: ["lead time", "how far ahead", "advance booking", "notice"] },
  { label: "Cancellation and refund window", section: "settings", tab: "booking", keywords: ["cancellation", "cancel window", "refund window", "free cancellation", "cut off"] },
  { label: "Google Meet links", section: "settings", tab: "booking", keywords: ["meet", "google meet", "video link", "calendar", "join window"] },
  { label: "Session timeout and sign-out", section: "settings", tab: "security", keywords: ["timeout", "inactivity", "sign out", "logout", "password"] },
  { label: "Admins and their access", section: "settings", tab: "access", keywords: ["admin", "user access", "scope", "staff", "permissions", "role", "phone masking"] },
  { label: "Prices of conditions", section: "catalog", tab: "conditions", keywords: ["price", "pricing", "fee", "condition", "service", "treatment", "catalog", "home visit price"] },
  { label: "Service areas and pincodes", section: "catalog", tab: "areas", keywords: ["pincode", "area", "city", "home visit area", "waitlist", "location"] },
  { label: "Foreign currency prices", section: "catalog", tab: "countries", keywords: ["currency", "country", "dollar", "usd", "international"] },
  { label: "Programme and home-visit rules", section: "settings", tab: "programmes", keywords: ["programme", "package", "course", "validity", "expiry", "recommendation rules"] },
  { label: "FAQ", section: "settings", tab: "public", keywords: ["faq", "questions", "help text"] },
  { label: "Testimonials", section: "settings", tab: "public", keywords: ["testimonial", "review", "patient story"] },
  { label: "Mission and vision", section: "settings", tab: "public", keywords: ["mission", "vision", "about us", "promises"] },
  { label: "Opening splash screen", section: "settings", tab: "public", keywords: ["splash", "intro screen", "greeting"] },
  { label: "Dark mode", section: "settings", tab: "public", keywords: ["dark mode", "theme", "appearance"] },
  { label: "Clinic name and contact details", section: "settings", tab: "brand", keywords: ["brand", "logo", "clinic name", "contact", "whatsapp", "phone number", "email", "instagram", "social"] },
  { label: "Intake and exam questions", section: "settings", tab: "clinical", keywords: ["intake", "questions", "pain map", "exam", "questionnaire", "measures"] },
  { label: "Announcements and banners", section: "settings", tab: "announcements", keywords: ["announcement", "banner", "notice", "pop up", "popup", "festival", "wish", "diwali"] },
  { label: "Who signed in as somebody", section: "logs", tab: "signed-in-as", keywords: ["sign in as", "impersonate", "view as", "reason", "why"] },
  { label: "Activity log", section: "logs", tab: "all", keywords: ["log", "history", "audit", "who changed", "activity"] },
  { label: "System health and warnings", section: "settings", tab: "health", keywords: ["error", "warning", "health", "broken", "failed", "sync"] },
  { label: "Abandoned checkouts", section: "people", tab: "abandoned", keywords: ["abandoned", "did not pay", "unpaid signup", "lead"] },
  { label: "Approve new accounts", section: "today", tab: "approvals", keywords: ["approve", "pending", "new therapist", "application", "verify"] },
  { label: "Book a session for a patient", section: "sessions", tab: "new", keywords: ["new booking", "book for", "create session", "schedule session"] },
  { label: "Therapist roster and leave", section: "sessions", tab: "roster", keywords: ["roster", "availability", "leave", "working hours", "shift"] },
  { label: "Business figures", section: "money", tab: "health", keywords: ["profit", "revenue", "margin", "roi", "investor", "bank"] },
  { label: "Costs and expenses", section: "money", tab: "costs", keywords: ["cost", "expense", "spend", "rent", "salary"] },
];

export type AdminScreenRef = {
  section: AdminSectionKey;
  sectionLabel: string;
  tab: string;
  label: string;
  blurb?: string;
};

export type AdminScreenResult = {
  /** Unique: the topic's label, or the screen's own. */
  key: string;
  label: string;
  /** "Money › Costs" */
  where: string;
  section: AdminSectionKey;
  tab: string;
};

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The screens and topics a query finds, among the screens this viewer can
 * open. Topics first (they answer the word typed), then screens by label,
 * then screens by section or description. Two letters at least.
 */
export function searchAdminScreens(
  screens: AdminScreenRef[],
  query: string,
  limit = 6
): AdminScreenResult[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const open = new Map(screens.map((s) => [`${s.section}:${s.tab}`, s]));
  const out: AdminScreenResult[] = [];
  const seen = new Set<string>();
  const push = (key: string, label: string, s: AdminScreenRef) => {
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push({ key, label, where: `${s.sectionLabel} › ${s.label}`, section: s.section, tab: s.tab });
  };

  for (const t of ADMIN_SEARCH_TOPICS) {
    const s = open.get(`${t.section}:${t.tab}`);
    if (!s) continue;
    if (norm(t.label).includes(q) || t.keywords.some((k) => norm(k).includes(q) || q.includes(norm(k)))) {
      push(`topic:${t.label}`, t.label, s);
    }
  }
  for (const s of screens) {
    if (norm(s.label).includes(q)) push(`screen:${s.section}:${s.tab}`, s.label, s);
  }
  for (const s of screens) {
    if (norm(s.sectionLabel).includes(q) || norm(s.blurb ?? "").includes(q)) {
      push(`screen:${s.section}:${s.tab}`, s.label, s);
    }
  }
  return out;
}
