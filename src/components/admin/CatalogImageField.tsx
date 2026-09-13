"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";
import Spinner from "@/components/system/Spinner";
import { useToast } from "@/lib/toast";
import {
  CATALOG_IMAGE_TYPES,
  FOCAL_DEFAULT,
  clampFocal,
  focalPosition,
  hasCustomFocal,
  type CatalogImageKind,
} from "@/lib/catalogImage";

/**
 * The cover-image control on every catalog form.
 *
 * It replaces a text box an admin pasted a URL into. That field had two
 * costs: in practice nobody filled it in, so the public site shipped with no
 * photographs and the cards read as unfinished -- and every cover that did
 * exist depended on a host this clinic does not control, on a page selling
 * medical care.
 *
 * Three states, in the order somebody meets them: nothing yet, a file
 * uploaded, and the picture being positioned. The third is the one worth
 * explaining. A cover renders with `object-fit: cover`, which crops to the
 * centre, and the card is 4:3 where the detail dialog is 16:9 -- so a
 * photograph with its subject anywhere but the middle lost a head to one of
 * them, which is what "the images look badly aligned" was.
 *
 * Dragging sets a **focal point** rather than cropping the file, and the
 * three preview frames say why: one position is correct at every ratio,
 * including ratios added after the photograph was uploaded. Cropping would
 * bake one shape into the bytes and make the other wrong.
 *
 * The frame never moves while you drag -- the picture moves inside it -- so
 * the admin is always judging the finished card rather than a floating crop
 * box.
 */
export default function CatalogImageField({
  kind,
  rowId,
  value,
  focalX,
  focalY,
  onChange,
  label = "Cover image",
}: {
  kind: CatalogImageKind;
  /** The row being edited, or a draft id for a row that does not exist yet.
   *  Only used as the storage path, so a draft is harmless. */
  rowId: string;
  value: string | null;
  focalX: number;
  focalY: number;
  /** One callback for all three, because they are one fact about the row and
   *  saving two of them without the third would position a picture that is
   *  no longer there. */
  onChange: (next: { url: string | null; focalX: number; focalY: number }) => void;
  label?: string;
}) {
  const { show } = useToast();
  const [uploading, setUploading] = useState(false);
  const [positioning, setPositioning] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Synchronous, because a `disabled` attribute lands a render too late and
  // two uploads racing would leave the row pointing at whichever finished
  // second.
  const busyRef = useRef(false);

  async function upload(file: File) {
    if (busyRef.current) return;
    busyRef.current = true;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("kind", kind);
      body.append("rowId", rowId);
      body.append("file", file);

      const res = await fetch("/api/admin/upload-catalog-image", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        show(data.error ?? "Could not upload that image.", "error");
        return;
      }
      setFileName(file.name);
      // A fresh picture goes back to centre. Keeping the last one's position
      // would apply a decision made about a different photograph, and the
      // admin has no way to know it had been carried over.
      onChange({ url: data.url, focalX: FOCAL_DEFAULT, focalY: FOCAL_DEFAULT });
      show("Image uploaded. Position it, then save.", "success");
    } catch {
      show("Could not reach the server. Please try again.", "error");
    } finally {
      busyRef.current = false;
      setUploading(false);
      // Cleared so choosing the same file twice still fires a change event --
      // which is exactly what somebody does after a failed upload.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>

      <input
        ref={inputRef}
        type="file"
        accept={CATALOG_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {value ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: focalPosition({ image_focal_x: focalX, image_focal_y: focalY }) }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">
                {fileName ?? "Current cover"}
              </p>
              <p className="text-[11px] text-slate-500">
                {hasCustomFocal({ image_focal_x: focalX, image_focal_y: focalY })
                  ? `Positioned at ${focalX}% ${focalY}%`
                  : "Centred - not positioned yet"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPositioning(true)}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800"
            >
              Preview &amp; position
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-teal-500 hover:text-teal-700 disabled:opacity-60"
            >
              {uploading && <Spinner />}
              Replace
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({ url: null, focalX: FOCAL_DEFAULT, focalY: FOCAL_DEFAULT })
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-red-400 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-teal-400 hover:bg-teal-50/40 disabled:opacity-60"
        >
          {uploading ? (
            <Spinner />
          ) : (
            <i aria-hidden className="fa-solid fa-arrow-up-from-bracket text-lg text-slate-400" />
          )}
          <span className="text-xs font-semibold text-slate-700">
            {uploading ? "Uploading…" : "Upload an image"}
          </span>
          <span className="text-[11px] text-slate-500">JPG, PNG or WebP · up to 5 MB</span>
        </button>
      )}

      {positioning && value && (
        <PositionDialog
          url={value}
          focalX={focalX}
          focalY={focalY}
          onCancel={() => setPositioning(false)}
          onDone={(next) => {
            onChange({ url: value, focalX: next.x, focalY: next.y });
            setPositioning(false);
            show("Position set. Save the form to publish it.", "success");
          }}
        />
      )}
    </div>
  );
}

function PositionDialog({
  url,
  focalX,
  focalY,
  onCancel,
  onDone,
}: {
  url: string;
  focalX: number;
  focalY: number;
  onCancel: () => void;
  onDone: (next: { x: number; y: number }) => void;
}) {
  const [x, setX] = useState(clampFocal(focalX));
  const [y, setY] = useState(clampFocal(focalY));
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const position = focalPosition({ image_focal_x: x, image_focal_y: y });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Dragging the pointer right moves the *picture* right, which means the
    // focal point moves left -- hence the subtraction. Getting this backwards
    // is the single thing that makes a reposition tool feel broken.
    setX((prev) => clampFocal(prev - ((e.clientX - last.current.x) / rect.width) * 100));
    setY((prev) => clampFocal(prev - ((e.clientY - last.current.y) / rect.height) * 100));
    last.current = { x: e.clientX, y: e.clientY };
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="catalog-image-position-title"
      closeLabel="Close image positioning"
    >
      <div className="p-6 sm:p-7">
        <h3
          id="catalog-image-position-title"
          className="font-display text-lg font-bold text-slate-900"
        >
          Position this image
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Drag the picture until the subject sits where you want it. The card frame stays put, so
          what you see is what a patient sees.
        </p>

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative mt-4 aspect-[4/3] w-full cursor-grab touch-none select-none overflow-hidden rounded-xl border border-slate-200 active:cursor-grabbing"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            style={{ objectPosition: position }}
          />
          {/* Thirds, so there is something to line a subject up against. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
              backgroundSize: "33.333% 33.333%",
            }}
          />
          <span className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/75 px-3 py-1 text-[11px] font-medium text-white">
            Drag to position
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
          <span>Focal point</span>
          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono tabular-nums">
            {position}
          </span>
        </div>

        {/* The argument for a focal point rather than a crop, made visible: one
            position, correct in every shape this photograph is used at. */}
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          The same position, everywhere it appears
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { ratio: "4/3", caption: "Card" },
            { ratio: "1/1", caption: "Square" },
            { ratio: "16/9", caption: "Dialog" },
          ].map((frame) => (
            <div
              key={frame.caption}
              className="relative overflow-hidden rounded-lg border border-slate-200"
              style={{ aspectRatio: frame.ratio }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: position }}
              />
              <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center text-[9px] text-white">
                {frame.caption}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDone({ x, y })}
            className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => {
              setX(FOCAL_DEFAULT);
              setY(FOCAL_DEFAULT);
            }}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-teal-500 hover:text-teal-700"
          >
            Centre
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
