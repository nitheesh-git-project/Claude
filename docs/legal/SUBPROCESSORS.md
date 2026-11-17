# Suppliers who process personal data

**Internal.** Every outside service that receives or stores personal data
for MoveRestore Physiotherapy: what it gets, where, and under which terms.
The Privacy policy's "Who sees it" table (`src/lib/legal/legalDocs.ts`) must
match this list -- change both together. Review every six months, and before
adding any new service.

| Supplier | What it does for us | Personal data it handles | Where | Terms to keep on file | Owner |
| --- | --- | --- | --- | --- | --- |
| **Supabase** | Database, sign-in, file storage, realtime; sends sign-in and password emails | Everything in the app: accounts, health profiles, session notes, uploaded documents, bookings, payments records, agreements, cookie choices | The project's region (`dr-pooja-physio-mumbai`: ap-south-1, Mumbai) | Supabase DPA (supabase.com/legal/dpa), Terms of Service | Nitheesh M |
| **Razorpay** | Takes payments and refunds | Name, email, phone, amount, card/UPI/bank details (held by Razorpay, never by us) | India | Razorpay Terms of Use and Privacy Policy; PCI-DSS certificate | Nitheesh M |
| **Google (Calendar / Meet)** | Calendar invites and Meet links for video sessions | Patient and therapist email addresses, session time, the session's title | Google's global infrastructure | Google Workspace / Cloud Data Processing Addendum | Nitheesh M |
| **Google Analytics** | Website analytics, only after consent | Pseudonymous device identifiers, pages visited, booking-funnel events (no names, contacts or health data -- see the allowlist in `src/lib/analytics.ts`) | Google's global infrastructure | Google Ads Data Processing Terms (accept in GA admin) | Nitheesh M |
| **Resend** | Emails for complaints and deletion requests | Name, email address, complaint text, reference numbers | Tokyo, Japan (ap-northeast-1; the closest region Resend offers to India) | Resend DPA (resend.com/legal/dpa) | Nitheesh M |
| **WhatsApp (Meta)** | Only when a person chooses to message the clinic | Whatever they send | Meta's global infrastructure | WhatsApp Business Terms | Nitheesh M |
| **Vercel** (hosting) | Runs the website and API | Request data passing through; server logs (IP addresses) | USA, with a global edge network | Vercel DPA | Nitheesh M |

## Transfers outside India

Supabase is in Mumbai. Google, Resend and Meta process data outside India.
The DPDP Act allows this except to countries the Government restricts; check
that list before adding a supplier. For EU/UK patients, rely on each
supplier's Standard Contractual Clauses (in the DPAs above).

## Before adding a new supplier

1. What personal data would it receive, and is there a way to send less?
2. Is there a data processing agreement? Download it into this folder.
3. Where will the data be stored?
4. Add a row here and to the Privacy policy, in the same change.
