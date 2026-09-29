import { formatClinicDateTimeWithZone } from "@/lib/formatDateTime";

// "When was this account created" is asked from both sides of the same row:
// an admin reads it off the directory and the profile, and the account holder
// reads it off their own Edit Profile screen -- so it renders on all three
// dashboards from one component rather than three copies of the sentence that
// could come to differ about the wording or the zone.
//
// It renders **nothing** when the stamp is absent. `profiles.created_at` is
// `not null`, so a missing value here means the read failed or the column was
// not selected -- and a line reading "Account created -" is a label on an
// absence, the rule `SpecialtyChip` follows for an unstated specialisation.
export default function AccountCreatedNote({
  createdAt,
  className = "text-xs text-slate-500",
}: {
  createdAt: string | null | undefined;
  className?: string;
}) {
  const rendered = formatClinicDateTimeWithZone(createdAt);
  if (rendered === "-") return null;
  return <p className={className}>Account created {rendered}</p>;
}
