import { createAdminClient } from "@/lib/supabase/admin";
import { loadPhoneLoginControls } from "@/lib/phoneLoginServer";
import PhoneLoginSwitch from "@/components/admin/PhoneLoginSwitch";

// Settings -> Sign-in & Security -> Phone sign-in. Self-fetching like
// EmailSettings; its route is requireAdminScope("settings").
export default async function PhoneLoginSettings() {
  const read = await loadPhoneLoginControls(createAdminClient());
  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6" data-testid="phone-login-settings">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Phone sign-in</h2>
      <p className="text-sm text-slate-600 mb-4">
        Lets patients, therapists and hospitals sign in, or reset a forgotten password, with a code texted to the mobile number they linked
        on their profile. Admins always sign in with email and password. Before switching on, the clinic&apos;s Supabase project needs an SMS
        provider (and, in India, a registered sender): see docs/auth/PHONE-SIGN-IN.md.
      </p>
      {read.status === "unreadable" ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          We couldn&apos;t check this setting just now, so phone sign-in is not offered. Refresh to try again.
        </p>
      ) : (
        <PhoneLoginSwitch enabled={read.controls.enabled} />
      )}
    </div>
  );
}
