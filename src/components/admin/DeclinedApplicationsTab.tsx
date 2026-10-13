import PagedList from "@/components/dashboard/PagedList";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { specialtyLabel } from "@/lib/therapistSpecialties";
import {
  DECLINE_KIND_LABELS,
  declineReasonLabel,
  type DeclinedApplication,
} from "@/lib/declineReasons";

const KIND_CHIP: Record<DeclinedApplication["kind"], string> = {
  patient: "text-teal-700 bg-teal-100",
  therapist: "text-purple-700 bg-purple-100",
  hospital: "text-sky-700 bg-sky-100",
};

// People -> Declined: every declined patient signup, therapist application
// and hospital inquiry, newest first, with the reason and who declined it.
// Read from declined_applications, which the two decline routes write in the
// same statement as the decline -- a declined signup's account is deleted,
// so this is the one place the person is still listed. Read-only: it is a
// record of decisions, and the table refuses edits.
export default function DeclinedApplicationsTab({
  rows,
  adminNames,
}: {
  /** `null` when the list could not be read -- said, never shown as empty. */
  rows: DeclinedApplication[] | null;
  adminNames: Record<string, string>;
}) {
  return (
    <section
      aria-label="Declined"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <h2 className="font-display font-bold text-lg text-slate-800 flex items-center gap-2">
        Declined
        {rows && rows.length > 0 && (
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
            {rows.length}
          </span>
        )}
      </h2>
      <p className="mt-1 mb-4 max-w-2xl text-xs leading-relaxed text-slate-500">
        {"Every signup and hospital inquiry that was declined, and why. A declined patient or therapist's account is deleted, so they can apply again - if they do, Approvals shows that they were declined before."}
      </p>
      {rows === null ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          This list couldn&apos;t be loaded just now. Refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">Nothing has been declined.</p>
      ) : (
        <PagedList
          noun="declined application"
          storageKey="admin-declined-applications"
          className="space-y-3"
          filters={[
            { key: "patient", label: "Patients" },
            { key: "therapist", label: "Therapists" },
            { key: "hospital", label: "Hospitals" },
          ]}
          items={rows.map((row) => ({
            id: row.id,
            group: row.kind,
            node: (
              <DeclinedCard
                row={row}
                declinedBy={row.declined_by ? adminNames[row.declined_by] ?? "An admin" : null}
              />
            ),
          }))}
        />
      )}
    </section>
  );
}

function detailText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function DeclinedCard({
  row,
  declinedBy,
}: {
  row: DeclinedApplication;
  declinedBy: string | null;
}) {
  const details = row.details ?? {};
  const credentials = detailText(details.credentials);
  const specialty = specialtyLabel(detailText(details.specialization));
  const orgDetails = detailText(details.org_details);
  const source = detailText(details.source);
  return (
    <div data-testid="declined-application" className="p-4 rounded-xl border border-slate-200 text-xs space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="font-bold text-slate-900 flex items-center gap-2">
            {row.full_name?.trim() || "No name given"}
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${KIND_CHIP[row.kind]}`}>
              {DECLINE_KIND_LABELS[row.kind]}
            </span>
          </p>
          <p className="text-slate-500 mt-0.5">
            Declined {formatClinicDateTime(row.declined_at)}
            {declinedBy ? ` by ${declinedBy}` : ""}
          </p>
        </div>
        <span className="font-semibold px-3 py-1 rounded-full text-red-700 bg-red-50">
          {declineReasonLabel(row.reason_code)}
        </span>
      </div>
      {row.reason_note && (
        <p className="whitespace-pre-line rounded-lg bg-slate-50 p-2.5 text-slate-700">
          {row.reason_note}
        </p>
      )}
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5">
        <dt className="font-semibold text-slate-500">Email</dt>
        <dd className="text-slate-800 break-all">
          {row.email ? (
            <a href={`mailto:${row.email}`} className="text-teal-700 hover:underline">
              {row.email}
            </a>
          ) : (
            "-"
          )}
        </dd>
        <dt className="font-semibold text-slate-500">Phone</dt>
        <dd className="text-slate-800">
          {row.phone ? (
            <a href={`tel:${row.phone}`} className="text-teal-700 hover:underline">
              {row.phone}
            </a>
          ) : (
            "-"
          )}
        </dd>
        {credentials && (
          <>
            <dt className="font-semibold text-slate-500">Credentials</dt>
            <dd className="text-slate-800">{credentials}</dd>
          </>
        )}
        {specialty && (
          <>
            <dt className="font-semibold text-slate-500">Specialisation</dt>
            <dd className="text-slate-800">{specialty}</dd>
          </>
        )}
        {source && (
          <>
            <dt className="font-semibold text-slate-500">Source</dt>
            <dd className="text-slate-800">{source}</dd>
          </>
        )}
        {orgDetails && (
          <>
            <dt className="font-semibold text-slate-500">Details</dt>
            <dd className="whitespace-pre-line text-slate-800">{orgDetails}</dd>
          </>
        )}
        <dt className="font-semibold text-slate-500">
          {row.kind === "hospital" ? "Received" : "Applied"}
        </dt>
        <dd className="text-slate-800">{row.applied_at ? formatClinicDateTime(row.applied_at) : "-"}</dd>
      </dl>
    </div>
  );
}
