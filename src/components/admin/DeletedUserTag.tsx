"use client";

import { useId, useState } from "react";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { formatRupees } from "@/lib/formatMoney";
import { MONEY_KIND_LABEL, deleteReasonLabel, type AccountDeletionInfo } from "@/lib/accountDeletionRecords";

/**
 * "Deleted user", with an (i) that says who deleted them, when, and why.
 *
 * Shown wherever a person deleted with their records kept still appears --
 * the People lists and their profile -- because the records under their name
 * stay. The (i) is the reason the admin chose, their note, the contact
 * details the profile no longer carries, and the money that was kept.
 */
export default function DeletedUserTag({ info }: { info: AccountDeletionInfo }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const money = info.records?.money ?? [];
  return (
    <span className="relative inline-flex items-center gap-1 align-middle" data-testid="deleted-user-tag">
      <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Deleted user</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Why was this account deleted?"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <i className="fa-solid fa-circle-info text-[11px]" aria-hidden="true" />
      </button>
      {open && (
        <span
          id={panelId}
          role="region"
          aria-label="Why this account was deleted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          data-testid="deleted-user-info"
          className="absolute right-0 top-7 z-30 block w-72 max-w-[calc(100vw-2rem)] cursor-default rounded-xl border border-slate-200 bg-white p-3 text-left text-[11px] font-normal normal-case text-slate-700 shadow-xl"
        >
          <span className="block font-bold text-slate-900">{deleteReasonLabel(info.reason)}</span>
          {info.note && <span className="mt-1 block whitespace-pre-wrap [overflow-wrap:anywhere]">{info.note}</span>}
          <span className="mt-2 block text-slate-500">
            {`Deleted ${formatClinicDateTime(info.deleted_at)}${info.deleted_by_name ? ` by ${info.deleted_by_name}` : ""}`}
          </span>
          {(info.email || info.phone) && (
            <span className="mt-2 block [overflow-wrap:anywhere]">
              {`Was: ${[info.email, info.phone].filter(Boolean).join(" · ")}`}
            </span>
          )}
          {money.length > 0 && (
            <span className="mt-2 block">
              <span className="block font-semibold text-slate-800">Money records kept</span>
              {money.map((m) => (
                <span key={m.kind} className="flex justify-between gap-2">
                  <span>{`${MONEY_KIND_LABEL[m.kind] ?? m.kind} × ${m.count}`}</span>
                  <span className="tabular-nums">{formatRupees(m.amountPaise)}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
