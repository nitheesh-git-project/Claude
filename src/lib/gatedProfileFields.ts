// Fields that must go through admin review (profile_change_requests)
// instead of being written directly, per role. Enforced server-side in
// the approve route — never trust the field list a client sends.
export const GATED_PROFILE_FIELDS: Record<string, string[]> = {
  patient: ["full_name", "date_of_birth", "gender", "phone"],
  therapist: ["full_name", "credentials", "specialization", "years_experience", "phone"],
};
