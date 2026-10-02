"use client";

import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { Fragment, useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { THERAPIST_SPECIALTIES } from "@/lib/therapistSpecialties";
import { MAX_YEARS_EXPERIENCE } from "@/lib/therapistExperience";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import Spinner from "@/components/system/Spinner";
import { useToast } from "@/lib/toast";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import {
  ACCESS_LEVEL_LABELS,
  ADMIN_CAPABILITY_GROUPS,
  ADMIN_SCOPES,
  ADMIN_SCOPE_BLURBS,
  ADMIN_SCOPE_LABELS,
  scopeHasCapability,
  sectionAccess,
  type AccessLevel,
  type AdminScope,
} from "@/lib/adminScope";
import ResetAdminPasswordButton from "@/components/admin/ResetAdminPasswordButton";
import SignInLinkResult from "@/components/admin/SignInLinkResult";

/**
 * Who can get into this dashboard, what each of them reaches, and who is
 * still allowed in.
 *
 * Before scopes there was one way to become an admin -- editing the database
 * by hand -- which was a single point of failure for the business, no way to
 * give an assistant limited access, and no way to take access away from
 * somebody who left. Scopes fixed the first two. This screen is the third,
 * plus the thing that was missing underneath both: **nowhere in the product
 * said what a scope actually means.** An owner deciding whether to hire
 * somebody into Operations could read the four one-line blurbs, or read the
 * source. The matrix below is that answer, written out.
 *
 * **It is derived and read-only, and both halves are deliberate.** Every cell
 * comes out of `adminScope.ts`, the same module the routes enforce with, so
 * this screen cannot claim an access nobody has. And the cells are not
 * checkboxes: a tick that does not change a route is a lie, and making them
 * real would mean a per-capability check at 98 routes -- a fine-grained
 * matrix whose failure mode is one route quietly falling through a gap in it,
 * which is exactly what coarse scopes exist to avoid. Changing what a desk
 * reaches is a code change, reviewed, and this screen is where you read the
 * result of one.
 */

export type AdminRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  scope: AdminScope;
  active: boolean;
  isSelf: boolean;
};

// Where the waiting belongs.
//
// Every control on this screen used to run its fetch *and* its
// `router.refresh()` inside one `startTransition(async …)`, which meant the
// button's own `isPending` stayed true until the refresh landed -- and on
// this page a refresh is the whole Server Component re-running, every screen
// and around forty queries, not the one row that changed. Suspending an
// admin therefore left the button spinning and disabled for as long as that
// took, which reads as a hang rather than as work.
//
// The split is: the control is busy for **its request**, and the refresh is
// handed to the global teal bar (`useRouter` -> `PendingWorkProvider` ->
// `RouteProgress`), which exists precisely because that half of the work
// outlives the button that started it. So each handler releases its own
// flag in a `finally` and calls `router.refresh()` after -- never the
// `setLoading(false); router.refresh();` shape this codebase warns about,
// because the bar is what makes the remaining wait visible rather than
// hidden.
//
// Each also guards with a synchronous ref rather than the `disabled`
// attribute alone, which lands a render too late for a double tap, and each
// catches a failed request: an unhandled throw inside the old transition put
// nothing on screen at all, which is indistinguishable from a button that
// did nothing.

const LEVEL_STYLE: Record<AccessLevel, { chip: string; mark: string; icon: string }> = {
  manage: {
    chip: "bg-teal-50 text-teal-800 border-teal-200",
    mark: "text-teal-600",
    icon: "fa-circle-check",
  },
  view: {
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    mark: "text-amber-500",
    icon: "fa-eye",
  },
  none: {
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    mark: "text-slate-300",
    icon: "fa-minus",
  },
};

function ScopePicker({ row, canManage }: { row: AdminRow; canManage: boolean }) {
  const [scope, setScope] = useState<AdminScope>(row.scope);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const router = useRouter();
  const { show } = useToast();

  async function handleChange(next: AdminScope) {
    if (savingRef.current) return;
    const previous = scope;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setScope(next);
    try {
      const res = await fetch("/api/admin/set-admin-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ userId: row.id, scope: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Put the select back where it was -- leaving it showing a value the
        // server refused is how an admin ends up believing access changed
        // when it didn't.
        setScope(previous);
        setError(data.error ?? "Could not change access.");
        return;
      }
    } catch {
      setScope(previous);
      setError("Could not reach the server. Please try again.");
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    show(`${row.fullName ?? "That admin"} now has ${ADMIN_SCOPE_LABELS[next]} access.`);
    // Deliberately after the control is released. See "Where the waiting
    // belongs" at the top of this file.
    router.refresh();
  }

  if (row.isSelf) {
    return <span className="text-[11px] text-slate-500">{ADMIN_SCOPE_LABELS[row.scope]} · you</span>;
  }

  if (!canManage) {
    return <span className="text-[11px] text-slate-500">{ADMIN_SCOPE_LABELS[row.scope]}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        aria-label={`Access level for ${row.fullName ?? row.email ?? "this admin"}`}
        value={scope}
        onChange={(e) => handleChange(e.target.value as AdminScope)}
        disabled={saving}
        className="rounded-lg border border-slate-300 p-1.5 text-xs disabled:opacity-60"
      >
        {ADMIN_SCOPES.map((s) => (
          <option key={s} value={s}>
            {ADMIN_SCOPE_LABELS[s]}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

/**
 * Suspend and restore. The enforcement for this already existed --
 * `getAdminUser` refuses an inactive admin and the proxy does the same -- and
 * the only way to switch it was editing the row by hand, which is the gap
 * scopes were added to close left open for the one case that matters most.
 * Suspending rather than deleting keeps the audit rows they wrote attributable.
 */
function StatusToggle({ row, canManage }: { row: AdminRow; canManage: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Synchronous, because a `disabled` attribute lands a render too late for
  // a double tap.
  const savingRef = useRef(false);
  const router = useRouter();
  const { show } = useToast();

  async function toggle() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    // Suspending also ends their sessions, and that half can fail on its own.
    // Hoisted out of the try so the success toast below can carry it: the
    // account is suspended either way, so it is a caveat on a success rather
    // than an error, and a route returning it with no screen reading it would
    // be worse than not returning it at all.
    let sessionWarning: string | null = null;
    try {
      const res = await fetch("/api/admin/set-admin-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ userId: row.id, active: !row.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not change this.");
        return;
      }
      if (typeof data.warning === "string") sessionWarning = data.warning;
    } catch {
      // A request that dies on a bad connection has to say so. Left
      // unhandled it threw inside the transition and put nothing on screen,
      // which reads as a button that did nothing.
      setError("Could not reach the server. Please try again.");
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // Names the person and what is now true of them -- "Saved" on this
    // control would leave an admin re-reading the row to check which way it
    // went.
    show(
      row.active
        ? `${row.fullName ?? "That admin"} can no longer sign in.`
        : `${row.fullName ?? "That admin"} can sign in again.`
    );
    if (sessionWarning) show(sessionWarning, "error");
    router.refresh();
  }

  if (!canManage || row.isSelf) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-60 ${
          row.active
            ? "border-slate-300 text-slate-700 hover:bg-slate-50"
            : "border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100"
        }`}
      >
        {saving && <Spinner size={11} />}
        {row.active ? "Suspend access" : "Restore access"}
      </button>
      {error && <span className="max-w-[16rem] text-right text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

/**
 * The matrix. Rows are the jobs people describe, columns are the four desks,
 * and every cell is read out of the same module the routes enforce with.
 */
function AccessMatrix() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-2 pr-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              What they can do
            </th>
            {ADMIN_SCOPES.map((s) => (
              <th
                key={s}
                className="w-28 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500"
              >
                {ADMIN_SCOPE_LABELS[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ADMIN_CAPABILITY_GROUPS.map((group) => (
            // A real Fragment, not `<>`: the shorthand cannot take a key, so
            // each group's two-part output (its heading row plus its rows)
            // went into the list unkeyed.
            <Fragment key={group.section}>
              <tr className="bg-slate-50">
                <td
                  colSpan={ADMIN_SCOPES.length + 1}
                  className="px-2 py-1.5 text-[11px] font-bold text-slate-700"
                >
                  {group.title}
                  {/* The level for the section itself, so the row group says
                      why the ticks under it fall where they do rather than
                      leaving a reader to infer the rule from the pattern. */}
                  <span className="ml-2 font-normal text-slate-500">
                    {ADMIN_SCOPES.map((s) => `${ADMIN_SCOPE_LABELS[s]}: ${ACCESS_LEVEL_LABELS[sectionAccess(s, group.section)].toLowerCase()}`).join(" · ")}
                  </span>
                </td>
              </tr>
              {group.capabilities.map((cap) => (
                <tr key={`${group.section}-${cap.label}`} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-xs text-slate-700">
                    {cap.label}
                    {!cap.writes && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                        read
                      </span>
                    )}
                  </td>
                  {ADMIN_SCOPES.map((s) => {
                    const has = scopeHasCapability(s, cap);
                    const level = sectionAccess(s, cap.section);
                    const style = LEVEL_STYLE[has ? level : "none"];
                    return (
                      <td key={s} className="px-2 py-2 text-center">
                        <i
                          aria-hidden
                          className={`fa-solid ${has ? style.icon : LEVEL_STYLE.none.icon} ${
                            has ? style.mark : LEVEL_STYLE.none.mark
                          }`}
                        />
                        <span className="sr-only">
                          {ADMIN_SCOPE_LABELS[s]}: {has ? "yes" : "no"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// What was just created, and how the person gets in.
//
// No password: the clinic hands over a one-time link with which they set
// their own (src/lib/accessLink.ts), and keeps no copy. Losing this panel
// loses nothing -- the person's own page (or row, for the back office)
// issues a fresh link.
function CreatedAccountPanel({
  created,
  onClose,
}: {
  created: { email: string; linkPath: string | null; warning?: string | null; role: string };
  onClose: () => void;
}) {
  const whereToReissue =
    created.role === "admin"
      ? "If it's lost, issue a new one from their row in Back office above."
      : "If it's lost, issue a new one from their profile under People.";

  return (
    <div className="relative rounded-lg border border-teal-200 bg-teal-50 p-3 pr-9 text-xs text-teal-900 space-y-2">
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-lg px-2 py-0.5 font-bold text-teal-700 transition hover:bg-teal-100"
      >
        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <p className="font-bold">Account created for {created.email}.</p>
      {created.linkPath ? (
        <SignInLinkResult linkPath={created.linkPath} />
      ) : (
        <p className="text-amber-800">{created.warning ?? "A sign-in link could not be made."}</p>
      )}
      <p className="text-teal-700">
        This platform sends no email, so send them the link yourself. {whereToReissue}
      </p>
    </div>
  );
}

function CreateAccountForm({ canCreateAdmin }: { canCreateAdmin: boolean }) {
  const [accountType, setAccountType] = useState<AccountTypeValue>("patient");
  const { role, adminScope } = parseAccountType(accountType);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [credentials, setCredentials] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<
    { email: string; linkPath: string | null; warning?: string | null; role: string } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const router = useRouter();
  // Only while the request is in flight. It used to cover the refresh as
  // well, so leaving the page during a ~40-query dashboard rebuild prompted
  // a warning about work that was already safely written.
  useUnloadWarning(saving);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setCreated(null);
    try {
      const body = JSON.stringify({
        role,
        fullName,
        email,
        phone: phone.trim() || null,
        credentials: credentials.trim() || null,
        specialization: specialization || null,
        yearsExperience: yearsExperience || null,
        adminScope,
      });
      const send = () =>
        fetch("/api/admin/create-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body,
        });

      let res = await send();
      // Retried exactly once, and only on the two statuses the route uses
      // for "could not check who you are" -- 401 (the session refresh race
      // this dashboard's own traffic causes) and 503 (the check itself
      // failed). Both are answered before anything is written, so there is
      // no account to duplicate; every other failure, including a 500 that
      // may have written something, is reported as it stands.
      if (res.status === 401 || res.status === 503) {
        res = await send();
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the account.");
        return;
      }
      // The person sets their own password with the one-time link this
      // returns; nothing is stored, and a lost link is replaced from their
      // own page.
      setCreated({ email, linkPath: data.linkPath ?? null, warning: data.warning ?? null, role });
      // Every field the form collects, not only the ones somebody remembered
      // -- a specialisation left behind from the last therapist is the next
      // account created with a fact about somebody else on it.
      setFullName("");
      setEmail("");
      setPhone("");
      setCredentials("");
      setSpecialization("");
      setYearsExperience("");
    } catch {
      setError("Could not reach the server. Please try again.");
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    router.refresh();
  }

  const fieldCls = "w-full p-2 rounded-lg border border-slate-300 text-xs";
  const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className={labelCls} htmlFor="new-account-role">
          Account type
        </label>
        <select
          id="new-account-role"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as AccountTypeValue)}
          className={fieldCls}
        >
          {/* Grouped rather than six flat entries: the first two are people
              the clinic treats or employs to treat, the rest are desks in
              the back office, and the labels alone do not say which is
              which. */}
          <optgroup label="Clinic">
            <option value="patient">Patient</option>
            <option value="therapist">Therapist</option>
          </optgroup>
          {canCreateAdmin && (
            <optgroup label="Back office">
              {ADMIN_SCOPES.map((s) => (
                <option key={s} value={`admin:${s}`}>
                  {ADMIN_SCOPE_LABELS[s]}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {/* The blurb moved up here with the choice it describes. It used to
            sit under the second dropdown, which is where it was needed
            then; the picker is the only place it belongs now. */}
        {role === "admin" && (
          <p className="mt-1 text-[11px] text-slate-500">{ADMIN_SCOPE_BLURBS[adminScope]}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="new-account-name">
            Full name
          </label>
          <input
            id="new-account-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="new-account-email">
            Email
          </label>
          <input
            id="new-account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldCls}
          />
        </div>
      </div>
      {role !== "admin" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="new-account-phone">
              Phone (optional)
            </label>
            <input
              id="new-account-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              className={fieldCls}
            />
          </div>
          {role === "therapist" && (
            <>
              <div>
                <label className={labelCls} htmlFor="new-account-credentials">
                  Credentials
                </label>
                <input
                  id="new-account-credentials"
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="new-account-specialization">
                  Specialist in
                </label>
                {/* Asked for here as well as on the public application form,
                    so a therapist hired offline is not the one profile on
                    /team with nothing where everybody else has a
                    specialisation. Blank is allowed -- they can set it
                    themselves -- which is why it is not required. */}
                <select
                  id="new-account-specialization"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={fieldCls}
                >
                  <option value="">Not set yet</option>
                  {THERAPIST_SPECIALTIES.map((s) => (
                    <option key={s.key} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="new-account-years">
                  Years of experience
                </label>
                {/* Same reasoning as the specialisation above it: asked here
                    too, so a therapist hired offline reads the same on /team
                    and in the directory as one who applied. Blank is allowed
                    and means "not said". */}
                <input
                  id="new-account-years"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_YEARS_EXPERIENCE}
                  step={1}
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  className={fieldCls}
                />
              </div>
            </>
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        The account is created already approved - you vetted it by creating it - and you
        get a one-time link for them to set their own password. No password is kept, and a
        lost link can be replaced from their page.
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      )}
      {created && <CreatedAccountPanel created={created} onClose={() => setCreated(null)} />}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        {saving && <Spinner size={12} />}
        {saving ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

/**
 * What the Account type picker offers, as one flat list.
 *
 * The four admin desks used to be behind a second dropdown that only
 * appeared after "Admin" was chosen, so creating the Operations account
 * somebody had just been hired into meant picking a word nobody uses
 * ("Admin") and then finding a control that was not on screen a moment
 * earlier. The dashboards are already named Master Admin / Operations /
 * Finance / Clinical everywhere else -- the sidebar brand, the page header,
 * the access note -- so the picker naming them too is the same rule the
 * label set was written for: an admin should not have to work out that the
 * Operations on this screen is the Operations on theirs.
 *
 * The value carries both halves (`admin:operations`) because the request
 * body still wants a role and a scope: this is one control over two fields,
 * never a new concept in the database.
 */
type AccountTypeValue = "patient" | "therapist" | `admin:${AdminScope}`;

function parseAccountType(value: AccountTypeValue): {
  role: "patient" | "therapist" | "admin";
  adminScope: AdminScope;
} {
  if (value === "patient" || value === "therapist") {
    // The scope is ignored by the route for a non-admin, but it is sent
    // rather than omitted so the body shape never varies by branch.
    return { role: value, adminScope: "operations" };
  }
  return { role: "admin", adminScope: value.slice("admin:".length) as AdminScope };
}

export default function AdminUserAccessTab({
  admins,
  viewerScope,
}: {
  admins: AdminRow[];
  viewerScope: AdminScope;
}) {
  const canManage = viewerScope === "full";
  const { rows: pageAdmins, pager } = usePagedList(admins, { storageKey: "admin-team" });
  // Two views over one subject rather than two screens: who is in the back
  // office, and what each desk means. Reading the second is how an owner
  // decides the first, so putting them a navigation apart would mean holding
  // one in your head while you looked at the other.
  const [view, setView] = useState<"people" | "levels">("people");
  const suspended = admins.filter((a) => !a.active).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-800">Back office</h2>
            <p className="text-xs text-slate-500">
              {canManage
                ? "Everyone who can sign in to this dashboard. You can't change your own access, and the last Master Admin can't be narrowed or suspended - otherwise nobody could ever widen it again."
                : "Only a Master Admin can change these."}
            </p>
          </div>
          <div className="flex rounded-xl border border-slate-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView("people")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                view === "people" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              People <span className="opacity-70">{admins.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setView("levels")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                view === "levels" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              What each level can do
            </button>
          </div>
        </div>

        {view === "people" ? (
          <>
            {suspended > 0 && (
              <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                {suspended} suspended {suspended === 1 ? "account is" : "accounts are"} still
                listed. A suspended admin cannot sign in, and their name stays on everything they
                did - which is why access is taken away rather than the account deleted.
              </p>
            )}
            <ul aria-label="Back office accounts" className="space-y-2">
              {pageAdmins.map((a) => (
                <li
                  key={a.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-xs ${
                    a.active ? "border-slate-200" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                      {a.fullName ?? "Unnamed admin"}
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          a.active
                            ? "border-teal-200 bg-teal-50 text-teal-700"
                            : "border-slate-300 bg-white text-slate-500"
                        }`}
                      >
                        {a.active ? "Active" : "Suspended"}
                      </span>
                    </p>
                    <p className="text-slate-500">{a.email}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{ADMIN_SCOPE_BLURBS[a.scope]}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <StatusToggle row={a} canManage={canManage} />
                    {/* A one-time sign-in link for a colleague who is locked
                        out. Full scope only, and never your own row -- the
                        honest answer for that is the emailed reset on
                        Sign-in & Security, which the route says too. */}
                    {canManage && (
                      <ResetAdminPasswordButton
                        adminId={a.id}
                        disabled={a.isSelf}
                        disabledReason="Reset your own on Sign-in & Security"
                      />
                    )}
                    {/* Never on your own row, and the route refuses it again
                        along with the last Master Admin who can still sign
                        in. An admin who has done anything at all is refused
                        and pointed at Suspend beside it -- which is the
                        everyday answer, since their id is on every audit row
                        they wrote. */}
                    {canManage && !a.isSelf && (
                      <DeleteAccountButton
                        userId={a.id}
                        name={a.fullName ?? a.email ?? "this admin"}
                        compact
                      />
                    )}
                    <ScopePicker row={a} canManage={canManage} />
                  </div>
                </li>
              ))}
            </ul>
            <ListPager pager={pager} noun="admin" />
          </>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              Read from the same rules the app itself enforces, so this can never claim access
              somebody does not have. It is a picture, not a set of switches: changing what a desk
              reaches is a code change, reviewed, because a tick here that did not also change what
              the server allows would be worse than no tick at all.
            </p>
            <p className="mb-4 flex flex-wrap gap-3 text-[11px]">
              {(["manage", "view", "none"] as const).map((l) => (
                <span
                  key={l}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-semibold ${LEVEL_STYLE[l].chip}`}
                >
                  <i aria-hidden className={`fa-solid ${LEVEL_STYLE[l].icon}`} />
                  {ACCESS_LEVEL_LABELS[l]}
                </span>
              ))}
            </p>
            <AccessMatrix />
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Create an account</h2>
        <p className="text-xs text-slate-500 mb-4">
          For a patient who walked in, a therapist hired offline, or another admin.
        </p>
        <CreateAccountForm canCreateAdmin={canManage} />
      </div>
    </div>
  );
}
