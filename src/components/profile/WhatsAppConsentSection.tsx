import { createClient } from "@/lib/supabase/server";
import { whatsappConfigured } from "@/lib/whatsappServer";
import { hasConsent, toWhatsAppNumber } from "@/lib/whatsappRules";
import WhatsAppConsentCard from "@/components/profile/WhatsAppConsentCard";

/** Profile -> WhatsApp messages. Drawn only once WhatsApp is set up on the
 *  server: until then there is nothing to say yes to, and offering it would
 *  be a promise the clinic cannot keep. Reads the patient's own choices
 *  (RLS) -- its own read, so a failure here touches nothing else. */
export default async function WhatsAppConsentSection({ userId, phone }: { userId: string; phone: string | null }) {
  if (!whatsappConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_consents")
    .select("choice, created_at")
    .eq("patient_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const number = toWhatsAppNumber(phone);
  return (
    <WhatsAppConsentCard
      granted={!error && hasConsent(data ?? [])}
      readFailed={!!error}
      number={number ? `+${number}` : null}
    />
  );
}
