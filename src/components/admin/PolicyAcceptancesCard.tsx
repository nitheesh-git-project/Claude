import { createAdminClient } from "@/lib/supabase/admin";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import {
  POLICY_CONTEXT_LABELS,
  POLICY_DOCUMENT_LABELS,
  currentTermsVersion,
  latestTermsVersion,
  type PolicyContext,
  type PolicyDocument,
} from "@/lib/policyAcceptance";

type Row = {
  document: PolicyDocument;
  version: string;
  context: PolicyContext;
  appointment_id: string | null;
  accepted_at: string;
};

/**
 * "Agreements" on a person's admin page: what they agreed to and when, from
 * policy_acceptances. Its own read, so a failure here says "could not be
 * loaded" and takes nothing else on the page with it -- and is never shown as
 * "no agreements", which would read as a person who never agreed.
 */
export default async function PolicyAcceptancesCard({ userId }: { userId: string }) {
  const { data, error } = await createAdminClient()
    .from("policy_acceptances")
    .select("document, version, context, appointment_id, accepted_at")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Row[];
  const latest = error ? undefined : latestTermsVersion(rows);
  const current = currentTermsVersion();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" data-testid="policy-acceptances">
      <h2 className="font-bold text-sm text-slate-800 mb-1">Agreements</h2>
      <p className="text-[11px] text-slate-600 mb-3">
        What this person agreed to, and when. Recorded by the system; nobody can edit it.
      </p>
      {error ? (
        <p className="text-xs text-amber-800">The agreements could not be loaded. Refresh to try again.</p>
      ) : (
        <>
          <p className="text-xs mb-3">
            {latest === current ? (
              <span className="font-semibold text-teal-800">Has agreed to the current Terms ({current}).</span>
            ) : latest ? (
              <span className="font-semibold text-amber-800">
                Agreed to an earlier version ({latest}); will be asked again at next sign-in.
              </span>
            ) : (
              <span className="font-semibold text-amber-800">
                Has not agreed to the Terms yet; will be asked at next sign-in.
              </span>
            )}
          </p>
          {rows.length > 0 && (
            <ul className="divide-y divide-slate-100 text-xs text-slate-700">
              {rows.map((r, i) => (
                <li key={`${r.accepted_at}-${i}`} className="py-2">
                  <p className="font-semibold text-slate-900">{POLICY_DOCUMENT_LABELS[r.document] ?? r.document}</p>
                  <p>
                    {formatClinicDateTime(r.accepted_at)} · {POLICY_CONTEXT_LABELS[r.context] ?? r.context} · version {r.version}
                    {r.appointment_id ? " · on a booking" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
