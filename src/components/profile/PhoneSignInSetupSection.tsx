import { createClient } from "@/lib/supabase/server";
import { phoneLoginOffered } from "@/lib/phoneLoginServer";
import PhoneSignInSetupCard from "@/components/profile/PhoneSignInSetupCard";

/** Profile -> Sign in with your phone. Drawn only while an admin has phone
 *  sign-in switched on, and never on an admin's own profile (admins sign in
 *  with email and password only -- src/lib/phoneLogin.ts). Shows the number
 *  verified on the person's sign-in account, if any. */
export default async function PhoneSignInSetupSection({ suggestedPhone }: { suggestedPhone: string | null }) {
  if (!(await phoneLoginOffered())) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return null;
  const verified = user.phone && user.phone_confirmed_at ? `+${user.phone.replace(/^\+/, "")}` : null;
  return <PhoneSignInSetupCard verifiedPhone={verified} suggestedPhone={suggestedPhone} />;
}
