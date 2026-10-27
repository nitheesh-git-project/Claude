"use client";

import { useState } from "react";
import PlanBuilder from "@/components/therapist/assessment/teach/PlanBuilder";
import TeachingLoop from "@/components/therapist/assessment/teach/TeachingLoop";
import { postPublish } from "@/components/therapist/assessment/api";
import type { CockpitFailure } from "@/lib/cockpit";
import type { LiveDisplayText } from "@/lib/assessmentRun";
import { exerciseByKey, type ContraFlag, type ExerciseDose } from "@/lib/exerciseLibrary";
import type { TeachingEvent } from "@/lib/exercisePlan";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { ProtocolStep, SessionProtocol } from "@/lib/sessionProtocols";
import { publishBody, type DraftItem } from "@/lib/teachTool";

export type TeachPlan = { id: string; version: number; items: { exerciseKey: string; dose: ExerciseDose }[] };

/**
 * The Home exercises step's tool: first the plan (pick the exercises and set
 * how often), then teach them one at a time. The cockpit owns the plan and
 * the marks (so they survive a visit to another tab); this owns only the
 * choices in flight. Every refusal is one sentence and one fix.
 */
export default function TeachTool({
  runId,
  protocol,
  step,
  profileKind,
  contraFlags,
  loadStatus,
  plan,
  marks,
  helperTicked,
  setupReady,
  exertionBlocked,
  ensureSetup,
  onPlan,
  onMark,
  onPreview,
}: {
  runId: string;
  protocol: SessionProtocol;
  step: ProtocolStep;
  profileKind: ProfileKind;
  contraFlags: ContraFlag[];
  loadStatus: "ok" | "not_migrated" | "unreadable";
  plan: TeachPlan | null;
  marks: TeachingEvent[];
  helperTicked: boolean;
  setupReady: boolean;
  exertionBlocked: string | null;
  ensureSetup: () => Promise<CockpitFailure | null>;
  onPlan: (plan: TeachPlan) => void;
  onMark: (event: TeachingEvent) => void;
  onPreview: (text: LiveDisplayText | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [failure, setFailure] = useState<CockpitFailure | null>(null);

  if (loadStatus !== "ok") {
    return (
      <p role="alert" data-testid="teach-unavailable" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[15px] text-amber-950">
        <span className="font-semibold">
          {loadStatus === "not_migrated"
            ? "Home exercises are not set up on this database yet."
            : "We could not check this patient's home exercises just now, so none are shown."}
        </span>
        <span className="mt-0.5 block font-bold">{loadStatus === "not_migrated" ? "Ask the clinic to apply the latest schema." : "Reload the page to try again."}</span>
      </p>
    );
  }

  const planMarks = plan ? marks.filter((m) => m.planId === plan.id && m.runId === runId) : [];

  async function publish(draft: DraftItem[]) {
    if (publishing) return;
    setPublishing(true);
    setFailure(null);
    try {
      // A helper exercise is published only once the set-up has ticked the helper.
      if (draft.some((d) => exerciseByKey(d.exerciseKey)?.needsHelper)) {
        const setup = await ensureSetup();
        if (setup) return setFailure(setup);
      }
      const r = await postPublish(publishBody(runId, draft));
      if (!r.ok) return setFailure(r.failure);
      onPlan({ id: r.data.plan.id, version: r.data.plan.version, items: r.data.items.map((i) => ({ exerciseKey: i.exerciseKey, dose: i.dose })) });
      onPreview(null);
      setEditing(false);
    } finally {
      setPublishing(false);
    }
  }

  const failureBox = failure && (
    <p
      role="alert"
      data-testid="teach-failure"
      data-kind={failure.kind}
      className={`rounded-xl border px-4 py-3 text-[15px] ${failure.kind === "refused" ? "border-red-200 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
    >
      <span className="font-semibold">{failure.message}</span>
      {failure.fix && <span className="mt-0.5 block font-bold">{failure.fix}</span>}
    </p>
  );

  if (!plan || editing) {
    return (
      <div className="space-y-4" data-testid="teach-tool" data-mode="plan">
        {plan && planMarks.length > 0 && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            Saving a new plan starts a new version. The marks made on the current plan stay on the record but do not carry over.
          </p>
        )}
        <PlanBuilder
          kind={profileKind}
          contraFlags={contraFlags}
          helperTicked={helperTicked}
          initial={plan ? plan.items.map((i) => ({ exerciseKey: i.exerciseKey, dose: { ...i.dose } })) : []}
          publishing={publishing}
          onPublish={(d) => void publish(d)}
          onCancel={plan ? () => setEditing(false) : null}
        />
        <div aria-live="polite" className="empty:hidden">
          {failureBox}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="teach-tool" data-mode="teach">
      <TeachingLoop
        key={plan.id}
        runId={runId}
        protocol={protocol}
        step={step}
        plan={plan}
        marks={planMarks}
        setupReady={setupReady}
        exertionBlocked={exertionBlocked}
        ensureSetup={ensureSetup}
        onMark={onMark}
        onPreview={onPreview}
        onChangePlan={() => {
          setFailure(null);
          setEditing(true);
        }}
      />
    </div>
  );
}
