"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import {
  ACCURACY_EXPLAINER,
  PHOTO_PRIVACY_LINE,
  angleMovementFor,
  measureAngle,
  meaningLine,
  mirrorPoint,
  mostImportantWarning,
  rotatePointClockwise,
  tiltFromLevel,
  tiltFromUpright,
  uprightFromReference,
  type Pt,
} from "@/lib/angleMeasure";
import { framingGuideFor } from "@/lib/angleFraming";
import { IDENTITY, displaySize, flipAcross, turnClockwise, type Affine } from "@/lib/angleView";
import { JOINT_MODES, movementLabel, type JointMode } from "@/lib/jointLandmarks";
import AngleDiagram from "./AngleDiagram";
import AngleStage, { type StagePoint } from "./AngleStage";
import { useAngleImage } from "./useAngleImage";

// "Measure from an image" for the Record a test dialog (clinician voice). Used
// while the physiotherapist and patient are on a video call in another tab: the
// physiotherapist loads a screenshot or the patient's photo, taps the landmarks,
// and the number appears large enough to read across a shared screen.
//
// The picture lives in this component's memory only. It is drawn to a canvas,
// never uploaded, stored or logged, and the landmark positions are never kept:
// "Use this angle" hands back one whole-degree number and nothing else.

type Points = (Pt | null)[];

const BTN =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-base font-bold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600";

export default function AngleTool({
  movement,
  side,
  mode,
  previous = null,
  onUse,
  onClose,
}: {
  movement: string;
  side: "left" | "right" | null;
  mode: JointMode;
  /** The last reading on this line, to say when a change is inside the photo's error. */
  previous?: number | null;
  /** The whole-degree estimate. Nothing else leaves the tool. */
  onUse: (value: number) => void;
  onClose: () => void;
}) {
  const def = angleMovementFor(movement);
  const guide = framingGuideFor(movement);
  const { image, error, setError, load, clear } = useAngleImage();
  const titleId = useId();
  const fileId = useId();
  const [matrix, setMatrix] = useState<Affine>(IDENTITY);
  const n = def?.landmarks.length ?? 0;
  const [pts, setPts] = useState<Points>(() => Array.from({ length: n + 2 }, () => null));
  const [history, setHistory] = useState<Points[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [opposite, setOpposite] = useState(false);
  const [refOn, setRefOn] = useState(false);
  const [refKind, setRefKind] = useState<"level" | "upright">("level");
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const ptsRef = useRef(pts);
  useEffect(() => {
    ptsRef.current = pts;
  });

  // A picture pasted anywhere while the tool is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        load(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [load]);

  const original = image ? { width: image.width, height: image.height } : { width: 1, height: 1 };
  const picture = displaySize(matrix, original);

  const begin = () => setHistory((h) => [...h.slice(-99), ptsRef.current.slice()]);
  const setPoint = (i: number, pt: Pt | null) => setPts((p) => p.map((q, j) => (j === i ? pt : q)));

  const refIndexes: [number, number] = [n, n + 1];
  const slots = refOn ? n + 2 : n;
  const nextEmpty = pts.slice(0, slots).findIndex((p) => p === null);
  const landmarksDone = pts.slice(0, n).every((p) => p !== null);

  const place = (pt: Pt) => {
    const target = ptsRef.current.slice(0, slots).findIndex((p) => p === null);
    if (target < 0) return;
    setPoint(target, pt);
    setActive(target);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setPts(last);
    setHistory(history.slice(0, -1));
  };

  const startAgain = () => {
    setPts(Array.from({ length: n + 2 }, () => null));
    setHistory([]);
    setActive(null);
    setOpposite(false);
    setRefOn(false);
    setMatrix(IDENTITY);
  };

  const turn = () => {
    if (!image) return;
    begin();
    const size = displaySize(matrix, original);
    setPts((p) => p.map((q) => (q ? rotatePointClockwise(q, size) : q)));
    setMatrix(turnClockwise(matrix, original));
  };
  const flip = () => {
    if (!image) return;
    begin();
    const size = displaySize(matrix, original);
    setPts((p) => p.map((q) => (q ? mirrorPoint(q, size) : q)));
    setMatrix(flipAcross(matrix, original));
  };

  const toggleRef = () => {
    if (refOn) {
      setPoint(n, null);
      setPoint(n + 1, null);
    }
    setRefOn(!refOn);
  };

  // The reading.
  const refA = refOn ? pts[n] : null;
  const refB = refOn ? pts[n + 1] : null;
  const refDone = !!(refA && refB);
  const tilt = refDone ? (refKind === "level" ? tiltFromLevel(refA, refB) : tiltFromUpright(refA, refB)) : null;
  const upright = refDone && def?.rule === "from_vertical" ? uprightFromReference(refA, refB, refKind, def.upright ?? "up") : null;
  const result =
    def && image
      ? measureAngle({ movement, points: pts.slice(0, n), image: picture, opposite, upright, previous, referenceTiltDegrees: tilt })
      : null;

  if (!def || !guide) return null;
  const label = movementLabel(movement) ?? movement;
  const modeLabel = JOINT_MODES.find((m) => m.key === mode)?.label.toLowerCase() ?? mode;
  const sideLabel = side ? `${side} ` : "";

  // One step at a time.
  const labels = ["Add the photo", ...def.landmarks.map((l) => `Place the ${l.label.toLowerCase()}`), "Use this angle"];
  const step = !image ? 0 : landmarksDone ? n + 1 : nextEmpty < 0 ? n + 1 : Math.min(nextEmpty, n - 1) + 1;
  const ok = result?.ok === true;
  const warning = result?.ok ? mostImportantWarning(result.warnings) : null;
  const noResult = !image || !result;

  let instruction: string;
  if (!image) instruction = "Add the photo to begin.";
  else if (!landmarksDone) {
    const l = def.landmarks[nextEmpty];
    instruction = `Tap the photo on the ${l.label.toLowerCase()}. ${l.where}.`;
  } else if (result && !result.ok) instruction = result.message;
  else if (refOn && !refDone) instruction = "Tap two places along an edge that should be level or upright.";
  else instruction = "Check the lines sit on the limb. Drag a point to fix it, then press Use this angle.";

  const stagePoints: StagePoint[] = pts.map((pt, i) => ({
    pt,
    tone: i < n ? "landmark" : "reference",
    label: i < n ? `Point ${i + 1}, the ${def.landmarks[i].label.toLowerCase()}` : `Reference line end ${i - n + 1}`,
  }));
  const vertexIndex = def.rule === "from_vertical" ? 0 : 1;
  const armIndices = def.rule === "from_vertical" ? [1] : [0, 2];

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) load(file);
    else setError("That is not a picture. Drop a photo or a screenshot.");
  };

  async function pasteButton() {
    setPasteHint(null);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          load(await item.getType(type));
          return;
        }
      }
      setPasteHint("There is no picture on the clipboard. Take a screenshot first.");
    } catch {
      setPasteHint("Your browser would not let us read the clipboard. Press Ctrl+V (or Cmd+V on a Mac) instead.");
    }
  }

  const stepper = (
    <div className="border-b border-slate-100 px-4 py-2 sm:px-6">
      <ol className="flex items-center gap-1.5" aria-label="Steps">
        {labels.map((l, i) => (
          <li
            key={l}
            aria-current={i === step ? "step" : undefined}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              i === step ? "bg-teal-700 text-white ring-2 ring-teal-300" : i < step ? "bg-teal-100 text-teal-900" : "bg-slate-100 text-slate-700"
            }`}
          >
            <span className="sr-only">{i < step ? "Done: " : i === step ? "Now: " : "Next: "}</span>
            {i + 1}
            <span className="sr-only"> {l}</span>
          </li>
        ))}
        <li className="ml-2 min-w-0 flex-1 truncate text-sm font-bold text-slate-900" aria-hidden>
          Step {step + 1} of {labels.length}: {labels[step]}
        </li>
      </ol>
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      data-testid="angle-tool"
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      className={`absolute inset-0 z-10 flex flex-col bg-white ${dropping ? "ring-4 ring-inset ring-teal-500" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">
            Measure from a photo
          </h2>
          <p className="text-sm text-slate-700">
            {label}, {sideLabel}side, {modeLabel}
          </p>
        </div>
        <button type="button" onClick={onClose} className={`${BTN} shrink-0`}>
          <i aria-hidden className="fa-solid fa-arrow-left" /> Back
        </button>
      </div>
      {stepper}

      {!image ? (
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center">
            <p className="font-display text-xl font-bold text-slate-900">Add the photo</p>
            <p className="mt-1 text-sm text-slate-700">Take a screenshot of the video call, or use a photo the patient sent.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <label htmlFor={fileId} className={`${PRIMARY} cursor-pointer`}>
                <i aria-hidden className="fa-solid fa-image" /> Choose a photo
              </label>
              <input
                id={fileId}
                type="file"
                accept="image/*"
                className="sr-only"
                data-testid="angle-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) load(f);
                  e.target.value = "";
                }}
              />
              <button type="button" onClick={pasteButton} className={BTN}>
                <i aria-hidden className="fa-solid fa-paste" /> Paste a screenshot
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-700">Or drop a picture here.</p>
            {(error || pasteHint) && (
              <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                {error ?? pasteHint}
              </p>
            )}
          </div>
          <p className="flex items-start gap-2 text-sm font-semibold text-slate-900" data-testid="angle-privacy">
            <i aria-hidden className="fa-solid fa-lock mt-0.5 text-teal-800" /> {PHOTO_PRIVACY_LINE} It is never sent anywhere.
          </p>

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <AngleDiagram kind={guide.diagram} />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Before you take the photo</h3>
              <p className="mt-0.5 text-sm text-slate-800">{guide.steps[0]}</p>
            </div>
          </div>
          <details className="rounded-xl border border-slate-200 p-3 text-sm text-slate-800" open>
            <summary className="min-h-[44px] cursor-pointer py-2 font-bold text-slate-900">All the camera tips</summary>
            <ol className="list-decimal space-y-1.5 pl-5">
              {guide.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </details>
          <details className="rounded-xl border border-slate-200 p-3 text-sm text-slate-800">
            <summary className="min-h-[44px] cursor-pointer py-2 font-bold text-slate-900">How accurate is a photo?</summary>
            <ul className="list-disc space-y-1.5 pl-5">
              {ACCURACY_EXPLAINER.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-5 lg:overflow-hidden">
            <div className="lg:col-start-2 lg:row-start-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3" data-testid="angle-readout">
                <div className="flex items-end gap-3">
                  <p
                    data-testid="angle-value"
                    className="font-display text-5xl font-extrabold leading-none text-slate-900 sm:text-6xl lg:text-7xl"
                    aria-hidden
                  >
                    {ok && result?.ok ? `${result.value}°` : "–"}
                  </p>
                  <p className="pb-1 text-sm font-bold text-teal-900">Estimate from a photo</p>
                </div>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {ok && result?.ok ? meaningLine(movement, result.value) : instruction}
                </p>
                {warning && (
                  <p role="status" data-testid="angle-warning" className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">
                    {warning.message}
                  </p>
                )}
                {ok && !warning && <p className="mt-2 text-sm text-slate-800">{instruction}</p>}
                <p className="sr-only" aria-live="polite" data-testid="angle-text">
                  {ok && result?.ok ? `${result.text} ${meaningLine(movement, result.value) ?? ""} ${warning ? warning.message : ""}` : instruction}
                </p>
              </div>
            </div>

            <div className="mt-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:flex lg:min-h-0 lg:flex-col">
              <div className="h-[44vh] min-h-[240px] lg:h-auto lg:min-h-0 lg:flex-1">
                <AngleStage
                  key={`${matrix.a}${matrix.b}${matrix.c}${matrix.d}`}
                  img={image.el}
                  original={original}
                  matrix={matrix}
                  points={stagePoints}
                  activeIndex={active}
                  vertexIndex={vertexIndex}
                  armIndices={armIndices}
                  referenceIndices={refDone ? refIndexes : null}
                  uprightFrom={upright ?? (def.rule === "from_vertical" && landmarksDone ? { x: 0, y: def.upright === "down" ? 1 : -1 } : null)}
                  onBegin={begin}
                  onPlace={place}
                  onMove={(i, pt) => setPoint(i, pt)}
                  onSelect={setActive}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={turn} className={BTN}>
                  <i aria-hidden className="fa-solid fa-rotate-right" /> Turn the photo
                </button>
                <button type="button" onClick={flip} className={BTN}>
                  <i aria-hidden className="fa-solid fa-left-right" /> Flip the photo
                </button>
                <button type="button" onClick={toggleRef} aria-pressed={refOn} className={`${BTN} ${refOn ? "border-teal-700 bg-teal-50" : ""}`}>
                  <i aria-hidden className="fa-solid fa-ruler-horizontal" /> Level line
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    startAgain();
                  }}
                  className={BTN}
                >
                  <i aria-hidden className="fa-solid fa-image" /> Different photo
                </button>
              </div>
              {refOn && (
                <fieldset className="mt-2 flex flex-wrap gap-2">
                  <legend className="text-xs text-slate-800">Tap two places along an edge in the photo that is:</legend>
                  {(
                    [
                      ["level", "Level (a table or shelf)"],
                      ["upright", "Upright (a door frame)"],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${refKind === k ? "border-teal-700 bg-teal-50 text-teal-950" : "border-slate-300 text-slate-900"}`}>
                      <input type="radio" name={`${titleId}-ref`} checked={refKind === k} onChange={() => setRefKind(k)} className="h-4 w-4 accent-teal-700" />
                      {l}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>

            <div className="mt-2 lg:col-start-2 lg:row-start-2 lg:overflow-y-auto">
              <p className="flex items-start gap-2 text-xs font-semibold text-slate-800">
                <i aria-hidden className="fa-solid fa-lock mt-0.5 text-teal-800" /> {PHOTO_PRIVACY_LINE}
              </p>

              {def.oppositeLabel && (
                <label className="mt-2 flex min-h-[44px] items-center gap-3 rounded-xl px-1 text-sm text-slate-900">
                  <input type="checkbox" checked={opposite} onChange={(e) => setOpposite(e.target.checked)} className="h-5 w-5 accent-teal-700" />
                  <span>{def.oppositeLabel}</span>
                </label>
              )}

              <details className="mt-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-800">
                <summary className="min-h-[44px] cursor-pointer py-2 font-bold text-slate-900">How accurate is this?</summary>
                <ul className="list-disc space-y-1.5 pl-5">
                  {ACCURACY_EXPLAINER.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </details>
            </div>

          </div>
        </>
      )}

      {image && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
          <button type="button" onClick={undo} disabled={history.length === 0} className={BTN}>
            <i aria-hidden className="fa-solid fa-rotate-left" /> Undo
          </button>
          <button type="button" onClick={startAgain} className={BTN}>
            <i aria-hidden className="fa-solid fa-eraser" /> Start again
          </button>
          <button
            type="button"
            data-testid="angle-use"
            disabled={noResult || !ok}
            onClick={() => result?.ok && onUse(result.value)}
            className={`${PRIMARY} min-w-[10rem] flex-1`}
          >
            Use this angle{ok && result?.ok ? ` (${result.value}°)` : ""}
          </button>
        </div>
      )}
    </section>
  );
}
