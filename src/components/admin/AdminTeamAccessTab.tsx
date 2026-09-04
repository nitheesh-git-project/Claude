"use client";

import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import {
  ADMIN_SCOPES,
  ADMIN_SCOPE_BLURBS,
  ADMIN_SCOPE_LABELS,
  type AdminScope,
} from "@/lib/adminScope";

// Who else can get into this dashboard, and how much of it they see.
//
// Before this there was exactly one way to become an admin -- editing the
// database by hand -- which meant a single point of failure for the
// business, no way to give an ops assistant limited access, and no way to
// take access away from someone who left.

export type AdminRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  scope: AdminScope;
  isSelf: boolean;
};

function ScopePicker({ row, canManage }: { row: AdminRow; canManage: boolean }) {
  const [scope, setScope] = useState<AdminScope>(row.scope);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(next: AdminScope) {
    const previous = scope;
    setError(null);
    setScope(next);
    startTransition(async () => {
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
      router.refresh();
    });
  }

  if (row.isSelf) {
    return (
      <span className="text-[11px] text-slate-400">
        {ADMIN_SCOPE_LABELS[row.scope]} · you
      </span>
    );
  }

  if (!canManage) {
    return <span className="text-[11px] text-slate-500">{ADMIN_SCOPE_LABELS[row.scope]}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={scope}
        onChange={(e) => handleChange(e.target.value as AdminScope)}
        disabled={isPending}
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

function CreateAccountForm({ canCreateAdmin }: { canCreateAdmin: boolean }) {
  const [accountType, setAccountType] = useState<AccountTypeValue>("patient");
  const { role, adminScope } = parseAccountType(accountType);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [credentials, setCredentials] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useUnloadWarning(isPending);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          role,
          fullName,
          email,
          phone: phone.trim() || null,
          credentials: credentials.trim() || null,
          adminScope,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the account.");
        return;
      }
      // Shown once and never stored for these roles -- read it out, then it
      // is gone. Kept on screen until the admin navigates away rather than
      // auto-dismissed, since losing it means resetting the password.
      setCreated({ email, password: data.password });
      setFullName("");
      setEmail("");
      setPhone("");
      setCredentials("");
      router.refresh();
    });
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
          <p className="mt-1 text-[11px] text-slate-400">{ADMIN_SCOPE_BLURBS[adminScope]}</p>
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
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        The account is created already approved — you vetted it by creating it — and a one-time
        password is shown here once. This platform sends no email, so read it out yourself.
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      )}
      {created && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
          <p className="font-bold">Account created.</p>
          <p className="mt-1">
            {created.email} · temporary password{" "}
            <span className="font-mono font-bold">{created.password}</span>
          </p>
          <p className="mt-1 text-teal-700">
            This is the only time it is shown. Tell them to change it after signing in.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

export default function AdminTeamAccessTab({
  admins,
  viewerScope,
}: {
  admins: AdminRow[];
  viewerScope: AdminScope;
}) {
  const canManage = viewerScope === "full";
  const { rows: pageAdmins, pager } = usePagedList(admins, { storageKey: "admin-team" });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Admins</h2>
        <p className="text-xs text-slate-500 mb-4">
          {canManage
            ? "Change what each admin can reach. You can't change your own access, and the last Master Admin can't be narrowed — otherwise nobody could ever widen it again."
            : "Only a Master Admin can change these."}
        </p>
        <ul className="space-y-2">
          {pageAdmins.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-xs"
            >
              <div>
                <p className="font-bold text-slate-900">{a.fullName ?? "Unnamed admin"}</p>
                <p className="text-slate-500">{a.email}</p>
                <p className="mt-1 text-[11px] text-slate-400">{ADMIN_SCOPE_BLURBS[a.scope]}</p>
              </div>
              <ScopePicker row={a} canManage={canManage} />
            </li>
          ))}
        </ul>
        <ListPager pager={pager} noun="admin" />
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
