"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ImageSize, Pt } from "@/lib/angleMeasure";
import { displaySize, fitView, frameToPicture, pictureToFrame, zoomView, type Affine, type View } from "@/lib/angleView";

// The picture, its draggable points and the lines between them. The picture is
// painted on a canvas; the lines are an SVG over it; each point is a real
// 44-pixel button so a finger, a mouse and the arrow keys all work. Points
// live in the DISPLAYED picture's pixels (after any turn or flip), and this
// component never keeps, sends or logs them.

const HIT = 44;
const LOUPE = 104;
const LOUPE_ZOOM = 3;
const TAP_SLOP = 6;

export type StagePoint = { pt: Pt | null; label: string; tone: "landmark" | "reference" };

type Gesture =
  | { kind: "tap"; startX: number; startY: number; view: View }
  | { kind: "pan"; startX: number; startY: number; view: View }
  | { kind: "pinch"; dist: number; mid: Pt; view: View }
  | null;

function paint(ctx: CanvasRenderingContext2D, img: HTMLImageElement, matrix: Affine, tx: number, ty: number, scale: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0);
}

export default function AngleStage({
  img,
  original,
  matrix,
  points,
  activeIndex,
  vertexIndex,
  armIndices,
  referenceIndices,
  uprightFrom,
  onBegin,
  onPlace,
  onMove,
  onSelect,
}: {
  img: HTMLImageElement;
  original: ImageSize;
  matrix: Affine;
  points: StagePoint[];
  activeIndex: number | null;
  /** Where the angle is drawn, and the two arms (or the one, for a rotation). */
  vertexIndex: number;
  armIndices: number[];
  /** The two ends of the optional reference line, once both are placed. */
  referenceIndices: [number, number] | null;
  /** A direction (picture upright) to draw from the vertex, for a rotation. */
  uprightFrom: Pt | null;
  /** Called before any change, so the tool can keep an Undo step. */
  onBegin: () => void;
  onPlace: (pt: Pt) => void;
  onMove: (index: number, pt: Pt) => void;
  onSelect: (index: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [userView, setUserView] = useState<View | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture>(null);
  const grab = useRef<Pt>({ x: 0, y: 0 });

  const picture = displaySize(matrix, original);
  const fit = fitView(picture, size);
  const view = userView ?? fit;

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The picture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, img, matrix, view.x, view.y, view.scale, dpr);
  }, [img, matrix, view.x, view.y, view.scale, size.width, size.height]);

  // The magnifier follows the point being moved or focused.
  const loupeIndex = dragging ?? focused;
  const loupePt = loupeIndex !== null ? points[loupeIndex]?.pt ?? null : null;
  useEffect(() => {
    const canvas = loupeRef.current;
    if (!canvas || !loupePt) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOUPE * dpr;
    canvas.height = LOUPE * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = view.scale * LOUPE_ZOOM;
    paint(ctx, img, matrix, LOUPE / 2 - loupePt.x * s, LOUPE / 2 - loupePt.y * s, s, dpr);
  }, [loupePt, img, matrix, view.scale]);

  // The wheel zooms about the cursor. Not passive, so the page does not scroll with it.
  const viewRef = useRef({ view, fit });
  useEffect(() => {
    viewRef.current = { view, fit };
  });
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const { view: v, fit: f } = viewRef.current;
      setUserView(zoomView(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX - r.left, y: e.clientY - r.top }, f));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const local = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  // Moving the background pans, two fingers pinch, a tap places the next point.
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: "tap", startX: p.x, startY: p.y, view };
    }
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomView(g.view, dist / g.dist, g.mid, fit);
      setUserView({ ...zoomed, x: zoomed.x + (mid.x - g.mid.x), y: zoomed.y + (mid.y - g.mid.y) });
    } else if (g.kind === "tap" || g.kind === "pan") {
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      if (g.kind === "tap" && Math.hypot(dx, dy) > TAP_SLOP) gesture.current = { kind: "pan", startX: g.startX, startY: g.startY, view: g.view };
      if (gesture.current?.kind === "pan") setUserView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    }
  }

  function up(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (g?.kind === "tap" && e.type === "pointerup") {
      onBegin();
      onPlace(frameToPicture(view, p));
    }
    if (pointers.current.size === 0) gesture.current = null;
    else if (g?.kind === "pinch") gesture.current = null;
  }

  function handleDown(e: ReactPointerEvent<HTMLButtonElement>, i: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = points[i].pt;
    if (!pt) return;
    const at = pictureToFrame(view, pt);
    const p = local(e);
    grab.current = { x: p.x - at.x, y: p.y - at.y };
    onBegin();
    onSelect(i);
    setDragging(i);
  }

  function handleMove(e: ReactPointerEvent<HTMLButtonElement>, i: number) {
    if (dragging !== i) return;
    const p = local(e);
    onMove(i, frameToPicture(view, { x: p.x - grab.current.x, y: p.y - grab.current.y }));
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const pt = points[i].pt;
    const step = e.shiftKey ? 10 : 1;
    const delta: Record<string, Pt> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const d = delta[e.key];
    if (!d || !pt) return;
    e.preventDefault();
    onBegin();
    onMove(i, { x: pt.x + d.x / view.scale, y: pt.y + d.y / view.scale });
  }

  const zoomBy = (factor: number) => setUserView(zoomView(view, factor, { x: size.width / 2, y: size.height / 2 }, fit));
  const f = (i: number): Pt | null => {
    const pt = points[i]?.pt;
    return pt ? pictureToFrame(view, pt) : null;
  };
  const vertex = f(vertexIndex);
  const arms = armIndices.map(f);
  const ref = referenceIndices ? [f(referenceIndices[0]), f(referenceIndices[1])] : null;

  // The arc that shows which angle is meant.
  let arc: string | null = null;
  if (vertex && arms.length === 2 && arms[0] && arms[1]) {
    const r = 30;
    const a0 = Math.atan2(arms[0].y - vertex.y, arms[0].x - vertex.x);
    const a1 = Math.atan2(arms[1].y - vertex.y, arms[1].x - vertex.x);
    let diff = a1 - a0;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const s = { x: vertex.x + r * Math.cos(a0), y: vertex.y + r * Math.sin(a0) };
    const t = { x: vertex.x + r * Math.cos(a0 + diff), y: vertex.y + r * Math.sin(a0 + diff) };
    arc = `M ${s.x} ${s.y} A ${r} ${r} 0 0 ${diff > 0 ? 1 : 0} ${t.x} ${t.y}`;
  }
  let uprightEnd: Pt | null = null;
  if (vertex && uprightFrom) {
    const len = Math.max(60, Math.min(size.width, size.height) * 0.3);
    uprightEnd = { x: vertex.x + uprightFrom.x * len, y: vertex.y + uprightFrom.y * len };
  }
  const line = (a: Pt, b: Pt, dash?: string, key?: string) => (
    <g key={key}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f172a" strokeOpacity="0.75" strokeWidth="5.5" strokeLinecap="round" strokeDasharray={dash} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={dash ? "#fcd34d" : "#5eead4"} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash} />
    </g>
  );

  const loupeLeft = loupePt && f(loupeIndex!) ? f(loupeIndex!)!.x > size.width / 2 : false;

  return (
    <div
      ref={frameRef}
      data-testid="angle-stage"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-xl bg-slate-950"
      style={{ cursor: dragging !== null ? "grabbing" : "crosshair" }}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" style={{ width: size.width, height: size.height }} />
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
        {vertex && arms.map((a, i) => (a ? line(vertex, a, undefined, `arm${i}`) : null))}
        {arc && <path d={arc} fill="none" stroke="#0f172a" strokeOpacity="0.75" strokeWidth="5" />}
        {arc && <path d={arc} fill="none" stroke="#fcd34d" strokeWidth="2.5" />}
        {vertex && uprightEnd && line(vertex, uprightEnd, "6 6", "upright")}
        {ref && ref[0] && ref[1] && line(ref[0], ref[1], "6 6", "ref")}
      </svg>

      {points.map((p, i) => {
        const at = f(i);
        if (!at || !p.pt) return null;
        const active = i === activeIndex;
        return (
          <button
            key={i}
            type="button"
            data-testid={`angle-point-${i}`}
            aria-label={`${p.label}. Drag it, or use the arrow keys to move it. Hold Shift for bigger steps.`}
            onPointerDown={(e) => handleDown(e, i)}
            onPointerMove={(e) => handleMove(e, i)}
            onPointerUp={(e) => {
              e.stopPropagation();
              setDragging(null);
            }}
            onPointerCancel={() => setDragging(null)}
            onKeyDown={(e) => handleKey(e, i)}
            onFocus={() => {
              setFocused(i);
              onSelect(i);
            }}
            onBlur={() => setFocused(null)}
            className="absolute flex touch-none items-center justify-center rounded-full focus-visible:outline-none"
            style={{ width: HIT, height: HIT, left: at.x - HIT / 2, top: at.y - HIT / 2 }}
          >
            <span
              aria-hidden
              className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[11px] font-bold shadow ${
                p.tone === "reference" ? "border-amber-200 bg-amber-400 text-slate-950" : "border-white bg-teal-600 text-white"
              } ${active ? "ring-4 ring-amber-300" : ""}`}
            >
              {p.tone === "reference" ? "R" : i + 1}
            </span>
          </button>
        );
      })}

      <div className="absolute right-2 top-2 flex flex-col gap-1.5">
        {(
          [
            ["Zoom in", "+", () => zoomBy(1.4)],
            ["Zoom out", "−", () => zoomBy(1 / 1.4)],
            ["Show the whole photo", "Fit", () => setUserView(null)],
          ] as const
        ).map(([label, text, run]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={run}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900/85 text-sm font-bold text-white shadow ring-1 ring-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {text}
          </button>
        ))}
      </div>

      {loupePt && (
        <div
          aria-hidden
          data-testid="angle-loupe"
          className={`pointer-events-none absolute top-2 overflow-hidden rounded-full border-2 border-white shadow-lg ${loupeLeft ? "left-2" : "left-14"}`}
          style={{ width: LOUPE, height: LOUPE }}
        >
          <canvas ref={loupeRef} style={{ width: LOUPE, height: LOUPE }} />
          <span className="absolute left-1/2 top-0 h-full w-px bg-amber-300/90" />
          <span className="absolute left-0 top-1/2 h-px w-full bg-amber-300/90" />
        </div>
      )}
    </div>
  );
}
