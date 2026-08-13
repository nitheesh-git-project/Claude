import { createAdminClient } from "@/lib/supabase/admin";
import IntakeQuestionEditor from "@/components/admin/IntakeQuestionEditor";
import PainMapQuestionEditor from "@/components/admin/PainMapQuestionEditor";
import type { QuestionOverrideRow } from "@/lib/painMap";

// Global question-bank management for both Patient Care Intake and Pain
// Map — lives once at the Patient Conditions tab level (not per-patient;
// this is config, not patient data), self-fetching like
// ConditionDetailContent so the tab's own big Promise.all in
// admin/dashboard/page.tsx doesn't grow for something this page-local.
export default async function QuestionBankManager() {
  const admin = createAdminClient();
  const [{ data: intakeOverrideRows }, { data: painMapOverrideRows }] = await Promise.all([
    admin.from("intake_question_templates").select("question_key, question_text, required"),
    admin.from("pain_map_question_templates").select("region, question_key, question_text"),
  ]);

  const overridesByRegion: Record<string, QuestionOverrideRow[]> = {};
  for (const row of painMapOverrideRows ?? []) {
    (overridesByRegion[row.region] ??= []).push(row);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">Patient Care Intake questions</h3>
        <IntakeQuestionEditor overrideRows={intakeOverrideRows ?? []} />
      </div>
      <div className="pt-4 border-t border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Pain Map questions</h3>
        <PainMapQuestionEditor overridesByRegion={overridesByRegion} />
      </div>
    </div>
  );
}
