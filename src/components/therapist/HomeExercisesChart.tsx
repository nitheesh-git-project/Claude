import SurfaceCard from "@/components/dashboard/SurfaceCard";
import ExercisePicture from "@/components/exercises/ExercisePicture";
import { formatClinicDate, formatClinicDateTime } from "@/lib/formatDateTime";
import type { ChartItem, ChartVersion } from "@/lib/exerciseChart";

export type HomeExercisesChartRead = { status: "ok"; versions: ChartVersion[] } | { status: "not_migrated" } | { status: "unreadable" };

function Item({ item, showMarks }: { item: ChartItem; showMarks: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid={`chart-exercise-${item.key}`}>
      <span className="w-16 shrink-0">
        <ExercisePicture picture={item.picture} name={item.name} tone="light" />
      </span>
      <div className="min-w-0 flex-1 text-sm text-slate-800">
        <p className="text-base font-bold text-slate-900">{item.name}</p>
        <p>{item.dose}</p>
        {item.note && <p className="text-slate-700">Note to patient: {item.note}</p>}
        {item.latest ? (
          <p className="mt-1 font-semibold text-slate-900">
            {item.latest.text}
            <span className="font-normal text-slate-700">
              {" "}
              · {item.latest.by}, {formatClinicDateTime(item.latest.at)}
              {item.latest.helper ? " · another adult beside the patient" : ""}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-slate-700">Not taught in a session yet.</p>
        )}
        {showMarks && item.marks.length > 1 && (
          <ul className="mt-1 list-disc pl-5 text-[13px] text-slate-700">
            {item.marks.map((m) => (
              <li key={m.at + m.text}>
                {m.text} · {m.by}, {formatClinicDateTime(m.at)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * The Home exercises on a patient's chart, read only: the current plan with
 * what was taught and how it went, and the earlier versions below it. Not the
 * Care plan (the programme recommendation, its own card). The therapist and
 * the admin read it; nothing here changes the plan (that happens in a guided
 * session).
 */
export default function HomeExercisesChart({ read }: { read: HomeExercisesChartRead }) {
  const title = "Home exercises";
  const subtitle = "What the patient was given to do at home, and how each exercise went when it was taught on video. The patient sees the current plan only.";
  if (read.status !== "ok") {
    return (
      <SurfaceCard title={title} icon="fa-person-walking" subtitle={subtitle}>
        <p role="status" className="text-sm text-slate-700" data-testid="chart-exercises-state" data-state={read.status}>
          {read.status === "not_migrated"
            ? "Home exercises are not set up on this database yet."
            : "We couldn't load the home exercises just now, so none are shown. Reload to try again."}
        </p>
      </SurfaceCard>
    );
  }
  const [current, ...earlier] = read.versions;
  if (!current) {
    return (
      <SurfaceCard title={title} icon="fa-person-walking" subtitle={subtitle}>
        <p className="text-sm text-slate-700" data-testid="chart-exercises-state" data-state="empty">
          No home exercises yet. They are set in a guided video assessment, on its Home exercises step.
        </p>
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard title={title} icon="fa-person-walking" subtitle={subtitle}>
      <div data-testid="chart-exercises" className="space-y-4">
        <p className="text-sm font-semibold text-slate-900">
          Version {current.version}
          {current.status === "active" ? " (current)" : " (replaced)"}{" "}
          <span className="font-normal text-slate-700">
            · set by {current.authoredBy} on {formatClinicDate(current.publishedAt)}
          </span>
        </p>
        <ul className="space-y-2">
          {current.items.map((i) => (
            <Item key={i.key} item={i} showMarks />
          ))}
        </ul>
        {earlier.length > 0 && (
          <details className="rounded-xl border border-slate-200" data-testid="chart-exercises-history">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              Earlier versions ({earlier.length})
            </summary>
            <div className="space-y-4 border-t border-slate-200 p-3">
              {earlier.map((v) => (
                <section key={v.planId} aria-label={`Version ${v.version}`} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Version {v.version}{" "}
                    <span className="font-normal text-slate-700">
                      · set by {v.authoredBy} on {formatClinicDate(v.publishedAt)}
                      {v.replacedAt ? `, replaced on ${formatClinicDate(v.replacedAt)}` : ""}
                    </span>
                  </p>
                  <ul className="space-y-2">
                    {v.items.map((i) => (
                      <Item key={i.key} item={i} showMarks />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </details>
        )}
      </div>
    </SurfaceCard>
  );
}
