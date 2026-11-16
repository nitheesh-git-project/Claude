import type { SupabaseClient } from "@supabase/supabase-js";
import { formatClinicDate, formatClinicDateTime } from "@/lib/formatDateTime";
import { formatRupees } from "@/lib/formatMoney";
import { POLICY_CONTEXT_LABELS, POLICY_DOCUMENT_LABELS, type PolicyContext, type PolicyDocument } from "@/lib/policyAcceptance";
import {
  DATA_REQUEST_STATUS_LABELS,
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_STATUS_LABELS,
  type DataRequestRole,
  type DataRequestStatus,
  type GrievanceCategory,
  type GrievanceStatus,
} from "@/lib/dataRequests";
import type { PersonalDataBlock, PersonalDataDoc, PersonalDataSection } from "@/lib/personalDataPdf";

// What goes into "Your data" for each role. Every read is the person's own
// rows, made with the service role and filtered by their id here; nothing
// about another person is included (a therapist's sessions carry no patient
// names, a hospital's referrals no patient names). A read that fails is said
// so in that section -- never shown as an empty list, which would read as
// "we hold nothing".

type Admin = SupabaseClient;

const UNREADABLE: PersonalDataBlock = {
  kind: "note",
  text: "This part could not be read just now. Download again in a few minutes, or write to us and we will send it.",
};

function rupees(paise: number | null | undefined): string {
  return typeof paise === "number" ? `Rs. ${formatRupees(paise)}` : "-";
}

function words(value: string | null | undefined): string {
  if (!value) return "-";
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function yesNo(v: boolean | null | undefined): string {
  return v ? "Yes" : "No";
}

function date(v: string | null | undefined): string {
  return v ? formatClinicDate(v) || "-" : "-";
}

function dateTime(v: string | null | undefined): string {
  return v ? formatClinicDateTime(v) || "-" : "-";
}

type Read<T> = { rows: T[]; failed: boolean };

async function read<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Read<T>> {
  try {
    const { data, error } = await q;
    if (error) return { rows: [], failed: true };
    return { rows: (Array.isArray(data) ? data : data ? [data] : []) as T[], failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}

function tableOr<T>(
  r: Read<T>,
  columns: Extract<PersonalDataBlock, { kind: "table" }>["columns"],
  toRow: (row: T) => string[],
  empty: string
): PersonalDataBlock {
  if (r.failed) return UNREADABLE;
  return { kind: "table", columns, rows: r.rows.map(toRow), empty };
}

async function commonSections(admin: Admin, userId: string): Promise<PersonalDataSection[]> {
  const [agreements, requests, grievances] = await Promise.all([
    read<{ document: PolicyDocument; version: string; context: PolicyContext; accepted_at: string }>(
      admin.from("policy_acceptances").select("document, version, context, accepted_at").eq("user_id", userId).order("accepted_at", { ascending: false }).limit(200)
    ),
    read<{ reference: string; kind: string; status: DataRequestStatus; created_at: string; resolved_at: string | null }>(
      admin.from("data_requests").select("reference, kind, status, created_at, resolved_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100)
    ),
    read<{ reference: string; category: GrievanceCategory; status: GrievanceStatus; created_at: string }>(
      admin.from("grievances").select("reference, category, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100)
    ),
  ]);
  return [
    {
      heading: "What you agreed to",
      intro: "Each time you agreed to our Terms, gave consent on a booking, or confirmed you were a child's parent or guardian.",
      blocks: [
        tableOr(
          agreements,
          [
            { label: "Agreement", width: 0.42 },
            { label: "When", width: 0.24 },
            { label: "Where", width: 0.18 },
            { label: "Version", width: 0.16 },
          ],
          (a) => [POLICY_DOCUMENT_LABELS[a.document] ?? a.document, dateTime(a.accepted_at), POLICY_CONTEXT_LABELS[a.context] ?? a.context, a.version],
          "No agreements are recorded yet."
        ),
      ],
    },
    {
      heading: "Your requests and complaints",
      blocks: [
        tableOr(
          requests,
          [
            { label: "Reference", width: 0.2 },
            { label: "Request", width: 0.28 },
            { label: "Made", width: 0.2 },
            { label: "Status", width: 0.16 },
            { label: "Closed", width: 0.16 },
          ],
          (r) => [r.reference, r.kind === "deletion" ? "Delete my account" : "Download my data", date(r.created_at), DATA_REQUEST_STATUS_LABELS[r.status] ?? r.status, date(r.resolved_at)],
          "No requests."
        ),
        tableOr(
          grievances,
          [
            { label: "Reference", width: 0.2 },
            { label: "Complaint about", width: 0.44 },
            { label: "Made", width: 0.2 },
            { label: "Status", width: 0.16 },
          ],
          (g) => [g.reference, GRIEVANCE_CATEGORY_LABELS[g.category] ?? g.category, date(g.created_at), GRIEVANCE_STATUS_LABELS[g.status] ?? g.status],
          "No complaints."
        ),
      ],
    },
  ];
}

type Profile = Record<string, unknown> & {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

async function categoryTitles(admin: Admin, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const r = await read<{ id: string; title: string }>(admin.from("treatment_categories").select("id, title").in("id", unique));
  return new Map(r.rows.map((c) => [c.id, c.title]));
}

async function patientDoc(admin: Admin, userId: string, p: Profile): Promise<Omit<PersonalDataDoc, "siteName" | "reference" | "generatedAtLabel" | "contactEmail">> {
  const [addresses, sessions, payments, packages, homePackages, documents, health] = await Promise.all([
    read<{ label: string | null; line1: string; line2: string | null; city: string | null; pincode: string | null; is_default: boolean }>(
      admin.from("patient_addresses").select("label, line1, line2, city, pincode, is_default").eq("patient_id", userId).eq("active", true)
    ),
    read<{ slot_time: string; category_id: string | null; visit_mode: string | null; status: string; payment_status: string | null; amount_paid_paise: number | null; session_code: string | null }>(
      admin.from("appointments").select("slot_time, category_id, visit_mode, status, payment_status, amount_paid_paise, session_code").eq("patient_id", userId).order("slot_time", { ascending: false }).limit(500)
    ),
    read<{ created_at: string; purpose: string | null; amount_paise: number | null; refunded_paise: number | null; status: string }>(
      admin.from("payments").select("created_at, purpose, amount_paise, refunded_paise, status").eq("patient_id", userId).order("created_at", { ascending: false }).limit(500)
    ),
    read<{ purchase_code: string | null; session_count: number; sessions_used: number; amount_paid_paise: number | null; status: string; expires_at: string | null }>(
      admin.from("patient_package_purchases").select("purchase_code, session_count, sessions_used, amount_paid_paise, status, expires_at").eq("patient_id", userId).order("created_at", { ascending: false })
    ),
    read<{ purchase_code: string | null; visit_count: number; visits_used: number; amount_paid_paise: number | null; status: string; expires_at: string | null }>(
      admin.from("home_visit_package_purchases").select("purchase_code, visit_count, visits_used, amount_paid_paise, status, expires_at").eq("patient_id", userId).order("created_at", { ascending: false })
    ),
    read<{ title: string | null; document_type: string | null; taken_on: string | null; created_at: string }>(
      admin.from("patient_medical_documents").select("title, document_type, taken_on, created_at").eq("patient_id", userId).order("created_at", { ascending: false })
    ),
    read<{ specialty: string | null; status: string | null; updated_at: string | null }>(
      admin.from("patient_condition_profiles").select("specialty, status, updated_at").eq("patient_id", userId)
    ),
  ]);
  const titles = await categoryTitles(admin, sessions.rows.map((s) => s.category_id));
  const paid = payments.rows.filter((x) => x.status === "captured" || x.status === "paid").reduce((t, x) => t + (x.amount_paise ?? 0), 0);

  return {
    personName: p.full_name || p.email || "You",
    roleLabel: "Patient",
    figures: [
      { label: "Sessions booked", value: sessions.failed ? "-" : String(sessions.rows.length) },
      { label: "Paid to date", value: payments.failed ? "-" : rupees(paid) },
      { label: "Documents uploaded", value: documents.failed ? "-" : String(documents.rows.length) },
      { label: "Member since", value: date(p.created_at) },
    ],
    sections: [
      {
        heading: "Your account",
        blocks: [
          {
            kind: "fields",
            rows: [
              ["Name", p.full_name ?? "-"],
              ["Email", p.email ?? "-"],
              ["Phone", p.phone ?? "-"],
              ["Date of birth", date(p.date_of_birth as string | null)],
              ["Gender", (p.gender as string | null) ?? "-"],
              ["Preferred language", (p.preferred_language as string | null) ?? "-"],
              ["Emergency contact", [p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(", ") || "-"],
              ["Patient ID", (p.patient_code as string | null) ?? "-"],
              ["Account created", dateTime(p.created_at)],
            ],
          },
        ],
      },
      {
        heading: "Saved addresses",
        blocks: [
          tableOr(addresses, [
            { label: "Label", width: 0.18 },
            { label: "Address", width: 0.52 },
            { label: "Pincode", width: 0.15 },
            { label: "Default", width: 0.15 },
          ], (a) => [a.label ?? "-", [a.line1, a.line2, a.city].filter(Boolean).join(", "), a.pincode ?? "-", yesNo(a.is_default)], "No saved addresses."),
        ],
      },
      {
        heading: "Sessions",
        intro: "Every session booked on your account, newest first. Times are India Standard Time.",
        blocks: [
          tableOr(sessions, [
            { label: "When", width: 0.22 },
            { label: "Service", width: 0.27 },
            { label: "Mode", width: 0.12 },
            { label: "Status", width: 0.14 },
            { label: "Payment", width: 0.12 },
            { label: "Paid", width: 0.13, align: "right" },
          ], (s) => [dateTime(s.slot_time), (s.category_id && titles.get(s.category_id)) || "-", s.visit_mode === "home" ? "Home visit" : "Video", words(s.status), words(s.payment_status), rupees(s.amount_paid_paise)], "No sessions yet."),
        ],
      },
      {
        heading: "Payments and refunds",
        intro: "Card, UPI and bank details are held by Razorpay, our payment provider, and never reach us.",
        blocks: [
          tableOr(payments, [
            { label: "Date", width: 0.2 },
            { label: "For", width: 0.3 },
            { label: "Amount", width: 0.17, align: "right" },
            { label: "Refunded", width: 0.17, align: "right" },
            { label: "Status", width: 0.16 },
          ], (x) => [date(x.created_at), words(x.purpose), rupees(x.amount_paise), x.refunded_paise ? rupees(x.refunded_paise) : "-", words(x.status)], "No payments yet."),
        ],
      },
      {
        heading: "Programmes and packages",
        blocks: [
          (() => {
            if (packages.failed || homePackages.failed) return UNREADABLE;
            const rows = [
              ...packages.rows.map((x) => [x.purchase_code ?? "-", "Video sessions", `${x.sessions_used} of ${x.session_count}`, rupees(x.amount_paid_paise), words(x.status), date(x.expires_at)]),
              ...homePackages.rows.map((x) => [x.purchase_code ?? "-", "Home visits", `${x.visits_used} of ${x.visit_count}`, rupees(x.amount_paid_paise), words(x.status), date(x.expires_at)]),
            ];
            return {
              kind: "table" as const,
              columns: [
                { label: "Code", width: 0.17 },
                { label: "Kind", width: 0.19 },
                { label: "Used", width: 0.14 },
                { label: "Paid", width: 0.16, align: "right" as const },
                { label: "Status", width: 0.16 },
                { label: "Expires", width: 0.18 },
              ],
              rows,
              empty: "No programmes or packages.",
            };
          })(),
        ],
      },
      {
        heading: "Health profile",
        intro: "Your answers about your condition. Every answer, the Pain Map and your progress are in the separate health profile download (Health Profile, then Download).",
        blocks: [
          tableOr(health, [
            { label: "Condition type", width: 0.4 },
            { label: "Status", width: 0.3 },
            { label: "Last updated", width: 0.3 },
          ], (h) => [words(h.specialty), words(h.status), dateTime(h.updated_at)], "You have not filled in a health profile."),
        ],
      },
      {
        heading: "Documents you uploaded",
        intro: "The files themselves stay in your account; this lists them.",
        blocks: [
          tableOr(documents, [
            { label: "Title", width: 0.4 },
            { label: "Type", width: 0.22 },
            { label: "Taken on", width: 0.19 },
            { label: "Uploaded", width: 0.19 },
          ], (d) => [d.title ?? "-", words(d.document_type), date(d.taken_on), date(d.created_at)], "No documents."),
        ],
      },
    ],
  };
}

async function therapistDoc(admin: Admin, userId: string, p: Profile): Promise<Omit<PersonalDataDoc, "siteName" | "reference" | "generatedAtLabel" | "contactEmail">> {
  const [sessions, payouts, requests, template] = await Promise.all([
    read<{ slot_time: string; category_id: string | null; visit_mode: string | null; status: string; therapist_payout_amount_paise: number | null; session_code: string | null }>(
      admin.from("appointments").select("slot_time, category_id, visit_mode, status, therapist_payout_amount_paise, session_code").eq("therapist_id", userId).order("slot_time", { ascending: false }).limit(1000)
    ),
    read<{ created_at: string; amount_paise: number; method: string | null }>(
      admin.from("therapist_payout_batches").select("created_at, amount_paise, method").eq("therapist_id", userId).order("created_at", { ascending: false })
    ),
    read<{ requested_at: string; requested_amount_paise: number; status: string; completed_at: string | null }>(
      admin.from("therapist_payout_requests").select("requested_at, requested_amount_paise, status, completed_at").eq("therapist_id", userId).order("requested_at", { ascending: false })
    ),
    read<{ day_of_week: number; hour: number }>(admin.from("therapist_availability_template").select("day_of_week, hour").eq("therapist_id", userId)),
  ]);
  const titles = await categoryTitles(admin, sessions.rows.map((s) => s.category_id));
  const paidOut = payouts.rows.reduce((t, x) => t + (x.amount_paise ?? 0), 0);
  const delivered = sessions.rows.filter((s) => s.status === "completed").length;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byDay = new Map<number, number[]>();
  for (const t of template.rows) byDay.set(t.day_of_week, [...(byDay.get(t.day_of_week) ?? []), t.hour]);
  const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

  return {
    personName: p.full_name || p.email || "You",
    roleLabel: "Physiotherapist",
    figures: [
      { label: "Sessions completed", value: sessions.failed ? "-" : String(delivered) },
      { label: "Paid to you", value: payouts.failed ? "-" : rupees(paidOut) },
      { label: "Payouts", value: payouts.failed ? "-" : String(payouts.rows.length) },
      { label: "Member since", value: date(p.created_at) },
    ],
    sections: [
      {
        heading: "Your account",
        blocks: [
          {
            kind: "fields",
            rows: [
              ["Name", p.full_name ?? "-"],
              ["Email", p.email ?? "-"],
              ["Phone", p.phone ?? "-"],
              ["Therapist ID", (p.therapist_code as string | null) ?? "-"],
              ["Registration / credentials", (p.credentials as string | null) ?? "-"],
              ["Specialisation", (p.specialization as string | null) ?? "-"],
              ["Years of experience", p.years_experience == null ? "-" : String(p.years_experience)],
              ["Languages", Array.isArray(p.languages) ? (p.languages as string[]).join(", ") || "-" : "-"],
              ["About you (public)", (p.bio as string | null) ?? "-"],
              ["Shown on Our team", yesNo(p.visible_on_team as boolean | null)],
              ["Revenue share", p.revenue_share_percent == null ? "-" : `${p.revenue_share_percent}%`],
              ["Account created", dateTime(p.created_at)],
            ],
          },
        ],
      },
      {
        heading: "Sessions assigned to you",
        intro: "Your own work record. Patients' names and health details are not part of your data and are left out.",
        blocks: [
          tableOr(sessions, [
            { label: "When", width: 0.24 },
            { label: "Service", width: 0.3 },
            { label: "Mode", width: 0.14 },
            { label: "Status", width: 0.16 },
            { label: "Your payout", width: 0.16, align: "right" },
          ], (s) => [dateTime(s.slot_time), (s.category_id && titles.get(s.category_id)) || "-", s.visit_mode === "home" ? "Home visit" : "Video", words(s.status), rupees(s.therapist_payout_amount_paise)], "No sessions yet."),
        ],
      },
      {
        heading: "Payouts",
        blocks: [
          tableOr(payouts, [
            { label: "Date", width: 0.3 },
            { label: "Method", width: 0.4 },
            { label: "Amount", width: 0.3, align: "right" },
          ], (x) => [date(x.created_at), words(x.method), rupees(x.amount_paise)], "No payouts yet."),
          tableOr(requests, [
            { label: "Requested", width: 0.3 },
            { label: "Amount", width: 0.25, align: "right" },
            { label: "Status", width: 0.2 },
            { label: "Completed", width: 0.25 },
          ], (x) => [date(x.requested_at), rupees(x.requested_amount_paise), words(x.status), date(x.completed_at)], "No payout requests."),
        ],
      },
      {
        heading: "Weekly availability",
        blocks: [
          template.failed
            ? UNREADABLE
            : {
                kind: "fields",
                rows: byDay.size
                  ? [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, hours]) => [DAYS[d] ?? `Day ${d}`, hours.sort((a, b) => a - b).map(hourLabel).join(", ")] as [string, string])
                  : [["Hours", "No weekly hours set."]],
              },
        ],
      },
    ],
  };
}

async function hospitalDoc(admin: Admin, userId: string, p: Profile): Promise<Omit<PersonalDataDoc, "siteName" | "reference" | "generatedAtLabel" | "contactEmail">> {
  const referrals = await read<{ created_at: string; status: string; visit_mode: string | null; treatment_needed: string | null }>(
    admin.from("patient_referrals").select("created_at, status, visit_mode, treatment_needed").eq("hospital_id", userId).order("created_at", { ascending: false }).limit(1000)
  );
  const converted = referrals.rows.filter((r) => r.status === "converted" || r.status === "booked").length;
  return {
    personName: (p.organization_name as string | null) || p.full_name || p.email || "Your organisation",
    roleLabel: "Hospital partner",
    figures: [
      { label: "Referrals made", value: referrals.failed ? "-" : String(referrals.rows.length) },
      { label: "Became patients", value: referrals.failed ? "-" : String(converted) },
      { label: "Partner since", value: date(p.created_at) },
    ],
    sections: [
      {
        heading: "Your organisation's account",
        blocks: [
          {
            kind: "fields",
            rows: [
              ["Organisation", (p.organization_name as string | null) ?? "-"],
              ["Contact name", p.full_name ?? "-"],
              ["Email", p.email ?? "-"],
              ["Phone", p.phone ?? "-"],
              ["Hospital ID", (p.hospital_code as string | null) ?? "-"],
              ["Referral code", (p.referral_code as string | null) ?? "-"],
              ["Account created", dateTime(p.created_at)],
            ],
          },
        ],
      },
      {
        heading: "Referrals",
        intro: "The referrals your organisation made. Patients' names and contact details belong to them and are left out.",
        blocks: [
          tableOr(referrals, [
            { label: "Referred", width: 0.24 },
            { label: "Treatment needed", width: 0.4 },
            { label: "Mode", width: 0.16 },
            { label: "Status", width: 0.2 },
          ], (r) => [date(r.created_at), r.treatment_needed ?? "-", r.visit_mode === "home" ? "Home visit" : "Video", words(r.status)], "No referrals yet."),
        ],
      },
    ],
  };
}

const PROFILE_SELECT =
  "full_name, email, phone, created_at, date_of_birth, gender, preferred_language, emergency_contact_name, emergency_contact_phone, patient_code, therapist_code, hospital_code, credentials, specialization, years_experience, languages, bio, visible_on_team, revenue_share_percent, organization_name, referral_code";

/** Everything that goes into the PDF for one person. Null when their profile
 *  itself could not be read: no partial document is better than one that
 *  silently leaves out who it is for. */
export async function loadPersonalDataDoc(
  admin: Admin,
  userId: string,
  role: DataRequestRole,
  meta: { siteName: string; reference: string; generatedAtLabel: string; contactEmail: string }
): Promise<PersonalDataDoc | null> {
  const { data: profile, error } = await admin.from("profiles").select(PROFILE_SELECT).eq("id", userId).maybeSingle();
  if (error || !profile) return null;
  const p = profile as Profile;
  const [body, common] = await Promise.all([
    role === "patient" ? patientDoc(admin, userId, p) : role === "therapist" ? therapistDoc(admin, userId, p) : hospitalDoc(admin, userId, p),
    commonSections(admin, userId),
  ]);
  return { ...meta, ...body, sections: [...body.sections, ...common] };
}
