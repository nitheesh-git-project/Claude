import { createAdminClient } from "@/lib/supabase/admin";
import IntakeQuestionBank from "@/components/admin/IntakeQuestionBank";
import PainMapQuestionEditor from "@/components/admin/PainMapQuestionEditor";
import { readEnabledSpecialties } from "@/lib/conditionProfileServer";
import type { IntakeQuestionOverrideRow } from "@/lib/conditionIntake";
import type { QuestionOverrideRow } from "@/lib/painMap";
import {
  CONDITION_SPECIALTIES,
  parseConditionSpecialty,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";

// Global question-bank management for both Patient Care Intake and Pain
// Map — lives once at the Patient Conditions tab level (not per-patient;
// this is config, not patient data), self-fetching like
// ConditionDetailContent so the tab's own big Promise.all in
// admin/dashboard/page.tsx doesn't grow for something this page-local.
export default async function QuestionBankManager() {
  const admin = createAdminClient();
  const [{ data: intakeOverrideRows }, { data: painMapOverrideRows }, enabledSpecialties] =
    await Promise.all([
      admin
        .from("intake_question_templates")
        .select("question_key, question_text, required, specialty"),
      admin.from("pain_map_question_templates").select("region, question_key, question_text"),
      readEnabledSpecialties(admin),
    ]);

  const overridesByRegion: Record<string, QuestionOverrideRow[]> = {};
  for (const row of painMapOverrideRows ?? []) {
    (overridesByRegion[row.region] ??= []).push(row);
  }

  // A row written before the bank became per-specialty carries no
  // specialty -- those are the orthopaedic overrides, since ortho is all
  // there was.
  const overrideRowsBySpecialty = Object.fromEntries(
    CONDITION_SPECIALTIES.map((s) => [s.key, [] as IntakeQuestionOverrideRow[]])
  ) as Record<ConditionSpecialty, IntakeQuestionOverrideRow[]>;
  for (const row of (intakeOverrideRows ?? []) as IntakeQuestionOverrideRow[]) {
    overrideRowsBySpecialty[parseConditionSpecialty(row.specialty)].push(row);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Patient Care Intake questions</h3>
        <p className="mb-3 text-xs text-slate-500">
          Each condition type has its own set. Wording and which answers are required are yours to
          change; which questions exist is not.
        </p>
        <IntakeQuestionBank
          overrideRowsBySpecialty={overrideRowsBySpecialty}
          enabledSpecialties={enabledSpecialties}
        />
      </div>
      <div className="pt-4 border-t border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Pain Map questions</h3>
        <PainMapQuestionEditor overridesByRegion={overridesByRegion} />
      </div>
    </div>
  );
}
