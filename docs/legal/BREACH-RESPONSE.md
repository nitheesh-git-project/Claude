# Personal data breach response plan

**Internal. Owner: the Grievance Officer (Nitheesh M).** Read this before you
need it; on the day, follow it top to bottom. It applies to MoveRestore
Physiotherapy's app, its Supabase projects, and every supplier in
[SUBPROCESSORS.md](SUBPROCESSORS.md).

A **personal data breach** is any unauthorised access to, or loss, change,
disclosure or destruction of personal data -- including a laptop left unlocked
with the admin dashboard open, a wrong email recipient, a leaked key, or a
supplier telling us they were breached. Health data is the most sensitive data
we hold: treat any doubt as a breach until shown otherwise.

---

## The clocks

| Who | When | Law |
| --- | --- | --- |
| **CERT-In** (incident@cert-in.org.in) | **Within 6 hours** of noticing, for the incident types CERT-In lists (unauthorised access, data leak, compromise of systems) | CERT-In Directions, 28 April 2022 |
| **Data Protection Board of India** | **Without delay** an intimation, and a **detailed report within 72 hours** | DPDP Act 2023 s.8(6); DPDP Rules 2025 r.7 |
| **Each affected person** | **Without delay**, in plain language | DPDP Rules 2025 r.7 |
| **EU/UK supervisory authority** (only if EU/UK patients are affected) | **Within 72 hours**, unless unlikely to risk people's rights | GDPR art.33 |
| **EU/UK patients themselves** | Without undue delay, when the risk is high | GDPR art.34 |

The 6-hour and 72-hour clocks start when **we become aware**, not when we
finish investigating. Report what you know, and say more is coming.

---

## 1. Contain (first hour)

1. **Write down the time you found out**, who told you, and what you saw. Keep
   a running log (date, time, who, what) in one document from now on.
2. **Stop it getting worse**, in this order of preference:
   - Suspend the affected account(s): Admin -> People -> the person ->
     Suspend. This ends their sessions immediately.
   - A leaked key: rotate it at once.
     - Supabase service-role or anon key: Supabase dashboard -> Project
       settings -> API -> roll the key, then update the server environment.
     - Razorpay secret: Razorpay dashboard -> API keys -> regenerate.
     - Google Calendar refresh token: revoke at myaccount.google.com/permissions.
     - Resend key: Resend dashboard -> API keys -> delete and recreate.
   - An admin account misused: User Access -> remove its scope, and change the
     owner's own password.
   - A storage file exposed: remove it from the bucket.
3. **Do not delete evidence.** Do not truncate tables, clear the activity log
   or run the debug data reset. `admin_activity_log` and the append-only
   tables are the record of what happened.

## 2. Assess (hours 1-4)

Answer, in the log:

- **What data?** Names and contact details only, or health records (health
  profile, Pain Map, session notes, documents), payment records, or keys?
- **Whose, and how many?** Patients, therapists, hospital partners; children
  (bookings made by a parent or guardian)? EU/UK patients?
- **How?** Our code, a misconfigured policy (RLS), a staff mistake, a stolen
  password, or a supplier.
- **Is it still happening?**

Useful reads: Admin -> Logs (who did what), System Health, the Supabase
project's logs, and the supplier's status page.

## 3. Report (before the clocks run out)

1. **CERT-In, within 6 hours** if it is a reportable incident: email
   incident@cert-in.org.in with the form from cert-in.org.in. Include what you
   know now.
2. **Data Protection Board**: intimation without delay, then the detailed
   report within 72 hours -- what happened, when, the data and people
   affected, likely consequences, what we did, and the Grievance Officer's
   contact.
3. **Affected people**: one plain-language email each, saying what happened,
   what data, what we have done, what they should do (change password, watch
   for phishing), and how to reach the Grievance Officer. No legal jargon, no
   blame.
4. **EU/UK**: only if EU/UK patients were affected; the authority where they
   live, within 72 hours.
5. **Hospital partners** whose referred patients are affected, under their
   agreement.

Get the lawyer on the phone as soon as reporting is likely. Do not wait for
the lawyer to send the 6-hour CERT-In report.

## 4. Fix and learn (within 2 weeks)

1. Fix the cause in code or configuration, with a test that would have caught
   it.
2. Write a short incident note in `docs/audit/`: timeline, cause, data
   affected, reports made, what changed.
3. Update this plan if anything in it was wrong or missing.

---

## Contacts

| Role | Who | How |
| --- | --- | --- |
| Grievance Officer / decision maker | Nitheesh M | grievance@moverestorephysio.com, +91 82772 04388 |
| Lawyer | *to fill in* | |
| CERT-In | | incident@cert-in.org.in |
| Data Protection Board of India | | *portal address to fill in once published* |
| Supabase support | | supabase.com/support |
| Razorpay support | | razorpay.com/support |

Review this plan every six months, and after every incident.
