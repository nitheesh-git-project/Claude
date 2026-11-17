import Image from "next/image";
import type { ReactNode } from "react";
import { AUTH_PHOTOS, type AuthPhotoId } from "@/lib/authPhotos";

/**
 * The "Calm Clinic" sign-in layout: a photograph on one half, the form on
 * the other. Side by side from md up; on a phone the photo is a 4:3 strip
 * above the form, so a face is never cropped to a sliver. The photo zooms
 * very slowly (5%, so it stays sharp) unless the visitor asks for less
 * motion. Shared by the patient, therapist and hospital doors.
 */
export default function AuthSplitLayout({
  photo,
  kicker,
  line,
  children,
}: {
  photo: AuthPhotoId;
  /** A short label over the photo, e.g. "For patients". */
  kicker: string;
  /** One sentence over the photo. */
  line: string;
  children: ReactNode;
}) {
  const { src, alt, position } = AUTH_PHOTOS[photo];
  return (
    <section className="px-4 py-6 sm:py-10">
      <div
        className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:grid md:min-h-[680px] md:grid-cols-2"
        data-testid="auth-split"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-teal-900 md:aspect-auto">
          <Image
            key={photo}
            src={src}
            alt={alt}
            fill
            priority
            placeholder="blur"
            sizes="(min-width: 768px) 50vw, 100vw"
            className="auth-photo object-cover"
            style={{ objectPosition: position, transformOrigin: position }}
            data-testid="auth-photo"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-transparent from-45% to-teal-950/85"
          />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6 text-white sm:p-8">
            <span className="self-start rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
              {kicker}
            </span>
            <p className="auth-rise max-w-md text-lg font-bold leading-snug sm:text-2xl">{line}</p>
          </div>
        </div>
        <div className="auth-rise flex flex-col justify-center px-5 py-8 sm:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>
      </div>
    </section>
  );
}
