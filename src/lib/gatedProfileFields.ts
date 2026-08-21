// Fields that must go through admin review (profile_change_requests)
// instead of being written directly, per role. Enforced server-side in
// the approve route — never trust the field list a client sends.
export const GATED_PROFILE_FIELDS: Record<string, string[]> = {
  patient: ["full_name", "date_of_birth", "gender", "phone"],
  therapist: ["full_name", "credentials", "specialization", "years_experience", "phone"],
  // A partner's organisation name is shown to the patients they refer, so
  // it is a trust claim in exactly the way a therapist's credentials are --
  // it goes through review rather than being directly writable.
  hospital: ["organization_name", "full_name", "phone"],
};
