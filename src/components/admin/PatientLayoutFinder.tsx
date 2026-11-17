"use client";

import { useState } from "react";
import { ProfileWidgetPatientPanel, type WidgetRow } from "@/components/admin/ProfileWidgetSettingsToggles";

/** A patient whose own layout differs from their condition type's. */
export type CustomisedPatient = { id: string; name: string; code: string | null; changed: number };

type Found = { id: string; name: string; code: string | null };
type Loaded = {
  patient: { id: string; name: string };
  kindLabel: string;
  rows: WidgetRow[];
  kindUnreadable: boolean;
  patientUnreadable: boolean;
};

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

/**
 * Settings -> Health Profile layout -> "Sections for one patient": find a
 * patient by name or patient ID and change their own layout, with the same
 * panel (and the same route and rules) as their record. Only the sections of
 * that patient's condition type are listed; safety sections stay locked on.
 * Rendered only for a scope that manages People, which is what the route
 * accepts.
 */
export default function PatientLayoutFinder({
  customised,
  customisedUnreadable,
}: {
  customised: CustomisedPatient[];
  customisedUnreadable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Found | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSearchError(null);
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/profile-widgets/patient?q=${encodeURIComponent(query)}`);
      const data = (await res.json().catch(() => null)) as { patients?: Found[]; error?: string } | null;
      if (!res.ok) {
        setResults(null);
        setSearchError(data?.error ?? "We couldn't search just now. Please try again.");
      } else {
        setResults(data?.patients ?? []);
      }
    } catch {
      setSearchError("We couldn't search - check your connection and try again.");
    } finally {
      setSearching(false);
    }
  }

  async function open(patient: Found) {
    setSelected(patient);
    setLoaded(null);
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/profile-widgets/patient?patientId=${encodeURIComponent(patient.id)}`);
      const data = (await res.json().catch(() => null)) as (Loaded & { error?: string }) | null;
      if (!res.ok || !data) setLoadError(data?.error ?? "We couldn't load this patient's sections. Please try again.");
      else setLoaded(data);
    } catch {
      setLoadError("We couldn't load this patient's sections - check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-6" data-testid="patient-layout-finder">
      <h3 className="font-display text-base font-bold text-slate-900">Sections for one patient</h3>
      <p className="mt-1 text-sm text-slate-600">
        When a section doesn&apos;t fit one patient - for example a test their physiotherapist says isn&apos;t relevant - find them here and
        switch it off for them only. Safety sections always stay on, and nothing recorded is deleted.
      </p>

      {selected ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">
              {selected.name}
              {selected.code && <span className="font-normal text-slate-600"> · {selected.code}</span>}
              {loaded && <span className="font-normal text-slate-600"> · {loaded.kindLabel}</span>}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setLoaded(null);
                setLoadError(null);
              }}
              className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              Choose another patient
            </button>
          </div>
          {loading && (
            <p role="status" className="mt-3 text-sm text-slate-600">
              Loading their sections...
            </p>
          )}
          {loadError && (
            <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </p>
          )}
          {loaded && (
            <div className="mt-3">
              <ProfileWidgetPatientPanel
                key={loaded.patient.id}
                patientId={loaded.patient.id}
                rows={loaded.rows}
                canManage
                kindUnreadable={loaded.kindUnreadable}
                patientUnreadable={loaded.patientUnreadable}
                defaultOpen
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <form onSubmit={search} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
            <div className="min-w-0 flex-1">
              <label htmlFor="patient-layout-search" className="text-sm font-semibold text-slate-800">
                Find a patient
              </label>
              <input
                id="patient-layout-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or patient ID, e.g. PT0012"
                autoComplete="off"
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <button type="submit" disabled={searching} className={`${BUTTON} bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-60`}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>
          {searchError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
              {searchError}
            </p>
          )}
          {results && (
            <div className="mt-3" aria-live="polite">
              {results.length === 0 ? (
                <p className="text-sm text-slate-600">No patient matches that name or ID.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="patient-layout-results">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void open(p)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                      >
                        <span className="font-semibold text-slate-900">{p.name}</span>
                        <span className="text-slate-600">{p.code ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-5">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Patients with their own layout{!customisedUnreadable && ` (${customised.length})`}
            </h4>
            {customisedUnreadable ? (
              <p role="status" className="mt-1 text-sm text-amber-900">
                We couldn&apos;t check this list just now. Refresh to try again.
              </p>
            ) : customised.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">None yet. Every patient sees their condition type&apos;s layout.</p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100" data-testid="patient-layout-customised">
                {customised.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <p className="min-w-0 text-sm text-slate-900">
                      <span className="font-semibold">{p.name}</span>
                      {p.code && <span className="text-slate-600"> · {p.code}</span>}
                      <span className="text-slate-600">
                        {" "}
                        · {p.changed} {p.changed === 1 ? "change" : "changes"}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void open({ id: p.id, name: p.name, code: p.code })}
                      className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
                      aria-label={`Open ${p.name}'s sections`}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
