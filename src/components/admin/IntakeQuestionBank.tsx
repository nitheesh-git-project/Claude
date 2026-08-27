"use client";

import { useState } from "react";
import IntakeQuestionEditor from "@/components/admin/IntakeQuestionEditor";
import type { IntakeQuestionOverrideRow } from "@/lib/conditionIntake";
import { CONDITION_SPECIALTIES, type ConditionSpecialty } from "@/lib/conditionSpecialty";

// One tab per specialty over the Patient Care Intake question bank.
//
// Tabs rather than three stacked sections: the three sets together are
// twenty-odd editable rows, and a wall of fields is the exact shape this
// codebase keeps correcting elsewhere (the intake wizard, the Pain Map
// exam dialog). An admin editing question wording is working on one
// specialty at a time.
//
// A specialty switched off in Settings keeps its tab and stays editable --
// config should be editable while the feature is off, and the badge says
// which state it is in so nobody edits a set that is not being offered
// without noticing.
export default function IntakeQuestionBank({
  overrideRowsBySpecialty,
  enabledSpecialties,
}: {
  overrideRowsBySpecialty: Record<ConditionSpecialty, IntakeQuestionOverrideRow[]>;
  enabledSpecialties: ConditionSpecialty[];
}) {
  const [active, setActive] = useState<ConditionSpecialty>("ortho");

  return (
    <div>
      <div role="tablist" aria-label="Condition type" className="flex flex-wrap gap-2">
        {CONDITION_SPECIALTIES.map((s) => {
          const isActive = s.key === active;
          const isOff = !enabledSpecialties.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(s.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <i aria-hidden className={`fa-solid ${s.icon} text-[10px]`} />
              {s.label}
              {isOff && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  Off
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <IntakeQuestionEditor
          key={active}
          specialty={active}
          overrideRows={overrideRowsBySpecialty[active] ?? []}
        />
      </div>
    </div>
  );
}
