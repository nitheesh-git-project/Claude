"use client";

import { useId } from "react";
import { motion } from "motion/react";
import OverlayPortal from "@/components/system/OverlayPortal";
import RichTextView from "@/components/RichTextView";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useLeavingPage } from "@/lib/useLeavingPage";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import type { DashboardAnnouncement } from "@/lib/announcements";

/**
 * The pop-up behind a banner: the picture, the admin's formatted text, and
 * the one button they may have added.
 *
 * On a phone it is one column -- picture on top, the words scrolling under
 * it, the button pinned at the bottom so it is never below the fold. From
 * `lg` up, with a picture, the picture takes the left and the words the
 * right, so a 4:3 greeting is seen whole instead of being squeezed above a
 * paragraph. The page behind is blurred as well as dimmed: this is the one
 * overlay on a dashboard whose job is to be looked at.
 *
 * The button is a plain anchor, like every other dashboard navigation (see
 * DashboardShell's renderHomeLink): a hard navigation, with the leaving bar
 * raised on click. A web link opens in a new tab so the dashboard stays.
 */
export default function AnnouncementDialog({
  announcement,
  onClose,
}: {
  announcement: DashboardAnnouncement;
  onClose: () => void;
}) {
  const titleId = useId();
  const markLeaving = useLeavingPage();
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: titleId });
  const hasImage = !!announcement.popupImageUrl;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-md sm:p-6"
        onClick={onClose}
        data-testid="announcement-dialog-backdrop"
      >
        <motion.div
          ref={panelRef}
          {...dialogProps}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          data-testid="announcement-dialog"
          className={`relative flex max-h-[min(92dvh,52rem)] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none ${
            hasImage ? "max-w-md lg:max-h-[min(88dvh,34rem)] lg:max-w-5xl lg:flex-row" : "max-w-lg"
          }`}
        >
          {hasImage && (
            <div className="relative shrink-0 bg-slate-100 lg:h-auto lg:w-[58%]">
              {/* An admin-uploaded picture from our own storage, drawn like
                  every other one (CatalogImage has the reasoning). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={announcement.popupImageUrl ?? undefined}
                alt=""
                className="block aspect-[4/3] max-h-[38dvh] w-full object-cover lg:absolute lg:inset-0 lg:aspect-auto lg:h-full lg:max-h-none"
              />
              {/* Holds the 4:3 shape on wide screens, where the picture
                  itself is laid over it to fill the column's full height. */}
              <div aria-hidden="true" className="hidden aspect-[4/3] w-full lg:block" />
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full transition ${
              hasImage
                ? "bg-slate-900/70 text-white hover:bg-slate-900 lg:bg-transparent lg:text-slate-500 lg:hover:bg-slate-100 lg:hover:text-slate-900"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <i aria-hidden="true" className="fa-solid fa-xmark text-base"></i>
          </button>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
              <h2
                id={titleId}
                className={`font-display text-xl font-bold leading-snug text-slate-900 sm:text-[22px] ${
                  hasImage ? "lg:pr-10" : "pr-10"
                }`}
              >
                {announcement.title}
              </h2>
              <p className="mt-1.5 text-[13px] font-medium text-slate-600">
                Showing until {formatClinicDateTime(announcement.endsAt)}
              </p>
              <RichTextView
                value={announcement.body}
                options={{ tables: true }}
                className="mt-4 text-[15px] leading-relaxed text-slate-700 sm:text-base [&_a]:text-teal-700"
                testId="announcement-dialog-body"
              />
            </div>
            {announcement.cta && (
              <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-5 pt-3.5 sm:px-6">
                <a
                  href={announcement.cta.href}
                  {...(announcement.cta.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : { onClick: () => markLeaving() })}
                  data-testid="announcement-dialog-cta"
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 py-3 text-center text-[15px] font-bold text-white transition hover:bg-teal-800"
                >
                  <span>{announcement.cta.label}</span>
                  <i
                    aria-hidden="true"
                    className={`fa-solid ${
                      announcement.cta.external ? "fa-arrow-up-right-from-square text-xs" : "fa-arrow-right text-sm"
                    }`}
                  ></i>
                </a>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </OverlayPortal>
  );
}
