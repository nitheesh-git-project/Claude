# Phone sign-in: going live

Sign-in with a phone code is **built and switched off**. Patients, therapists
and hospitals can use it once it is on; **admins never** (email and password
only). Code: `src/lib/phoneLogin.ts` (rules), `src/app/api/auth/phone/send`
and `.../verify` (the two steps), `src/components/auth/PhoneCodeSignIn.tsx`
(the sign-in cards), `src/components/profile/PhoneSignInSetupCard.tsx`
(linking a number), and the admin guard in `src/lib/supabase/requireAdmin.ts`.

## How it behaves

- Only an account that has **linked and verified** its mobile number (Profile
  -> Sign in with your phone) can sign in with a code. Phone sign-in never
  creates an account; new patients register as before.
- Asking for a code always gets the same answer ("If this number is linked to
  an account, we've texted it a code"), whether or not it has an account, so
  nobody can use it to find out who is registered.
- No code is ever texted to an admin's number, and a session started with a
  code is refused by every admin route, even if the code was obtained another
  way.
- Forgot password -> **Text me a code instead**: the code signs the person in
  and takes them to choose a new password. The email link still works.
- Codes are rate-limited per device (10 an hour) and per number (5 an hour),
  and guesses are capped. Each code is a text the clinic pays for.

## 1. An SMS provider on the Supabase project (needs company registration)

In India, business SMS needs a **DLT registration** (an entity ID, a sender ID
/ header and an approved template for the code message) with an operator such
as Jio, Airtel or Vi, which needs the company registration.

Then, in the Supabase dashboard: **Authentication -> Sign In / Providers ->
Phone**, switch Phone on and pick the provider:

- **Twilio / Vonage / MessageBird / Textlocal**: built in; paste the
  provider's keys. Turn **"Allow new users to sign up" OFF** for phone.
- **MSG91, Gupshup or another Indian gateway** (usually cheaper with DLT):
  use Supabase's **Send SMS hook** pointing at the gateway. This needs a small
  function; ask for it as a follow-up.

Set the SMS template to include the code, e.g. "Your MoveRestore sign-in code
is {{ .Code }}. It expires in 10 minutes." (it must match the DLT template).

Do this on **staging first** (with your own number), then production.

## 2. Switch it on

**Settings -> Sign-in & Security -> Phone sign-in**: switch on (it asks to
confirm). The sign-in pages then offer "Sign in with a phone code instead",
and profiles offer "Link my number".

## 3. Check

1. As a test patient with a real email, link your own number on the profile.
2. Sign out; sign in with a phone code.
3. Forgot password -> Text me a code instead -> choose a new password.
4. As an admin, confirm the admin sign-in page has no phone option.

## 4. Privacy wording

When live, add the SMS provider to `docs/legal/SUBPROCESSORS.md` and the
Privacy policy's provider table (`src/lib/legal/legalDocs.ts`), e.g. "Twilio:
texting sign-in codes".
