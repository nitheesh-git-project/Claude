import { Suspense } from "react";
import BookingExitLink from "@/components/booking/BookingExitLink";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import BookingWizard from "@/components/BookingWizard";
import { CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { BOOKING_LEAD_TIME_HOURS } from "@/lib/bookingSlots";
import BookingBackToSessions from "@/components/BookingBackToSessions";
import { Reveal } from "@/components/motion/primitives";
import { parseBookingLanguages } from "@/lib/adminSettings";

export const metadata: Metadata = {
  title: "Book a Session | MoveRestore",
  description: "Book your virtual physical therapy session.",
};

// createPublicClient() never touches cookies(), so this page ISR-caches the
// same as Conditions/Team/FAQ instead of being forced into per-request
// dynamic rendering -- BookingWizard's own client-side getUser() call still
// handles the logged-in-patient autofill separately, after hydration; this
// just gets Step 1's category dropdown populated immediately instead of
// blank until a client-side fetch resolves.
export const revalidate = 300;

export default async function BookPage() {
  const supabase = createPublicClient();
  const [
    { data: categories },
    { data: categoryImages },
    { data: categoryFocals },
    { data: settingsRow },
    { data: promoRow },
    { data: cancelRow },
    { data: leadRow },
  ] = await Promise.all([
    // `description` and `points` are what the service picker's cards and
    // detail view read. They have existed on this table since it was
    // created and render on /conditions already; this page simply never
    // asked for them, which is why its picker was a line of text per
    // option.
    supabase
      .from("treatment_categories")
      .select("id, title, price_paise, duration_minutes, description, points")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    // The cover photograph, in its own call: `image_url` is
    // migration-dependent (added at the end of schema.sql), and one
    // unknown-column error must cost the pictures rather than the whole
    // list of things a patient can book. Same shape as /conditions.
    supabase.from("treatment_categories").select("id, image_url").eq("active", true),

    // Where the subject of each cover sits, split from the read above
    // rather than folded into it: these columns are newer than `image_url`,
    // so one query would lose the photographs as well as their positions on
    // a database mid-migration. Apart, they degrade separately.
    supabase
      .from("treatment_categories")
      .select("id, image_focal_x, image_focal_y")
      .eq("active", true),

    // Step 1's language chips. Kept as its own query (rather than joined
    // into the one above) for the same migration-tolerance reason as the
    // admin dashboard's: if booking_languages doesn't exist yet, this one
    // query fails and parseBookingLanguages falls back to ["English"],
    // instead of the failure blanking the category list too.
    supabase.from("site_settings").select("booking_languages").maybeSingle(),

    // The promo master switch, in its own query for the same reason the
    // languages are: it is the newest column on that table, and losing it
    // must cost the code field rather than the category list.
    supabase.from("site_settings").select("promo_codes_enabled").maybeSingle(),

    // The cancellation window the review step quotes. An admin setting, and
    // the wizard printed the constant instead -- so a clinic that widened
    // the window had the old number read back to every patient on the one
    // screen that reads as a promise. Its own query, same reasoning again:
    // losing it costs the sentence its number, not the page its categories.
    supabase.from("site_settings").select("online_cancellation_refund_hours").maybeSingle(),

    // How far ahead a session must be booked. Its own query for the same
    // reason as the three above -- and the reason it is here at all is that
    // Step 1 filtered on the constant while /api/appointments/create has
    // read this column since it became a setting: a clinic that widened the
    // window was offered the old one by its own picker and had the booking
    // refused at the last step of checkout.
    supabase.from("site_settings").select("online_booking_lead_time_hours").maybeSingle(),
  ]);

  const imageByCategoryId = new Map(
    (categoryImages ?? []).map((row) => [row.id, row.image_url])
  );
  const focalByCategoryId = new Map(
    (categoryFocals ?? []).map((row) => [
      row.id,
      { image_focal_x: row.image_focal_x, image_focal_y: row.image_focal_y },
    ])
  );
  const bookableCategories = (categories ?? []).map((c) => ({
    ...c,
    image_url: imageByCategoryId.get(c.id) ?? null,
    ...(focalByCategoryId.get(c.id) ?? {}),
  }));

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-teal-50/50 to-slate-100 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <Reveal className="text-center mb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            Book Your Session
          </h1>
          <p className="text-slate-600 text-sm mt-1.5">
            A few quick steps - pick a time, tell us what&apos;s going on, and
            you&apos;re booked.
          </p>
        </Reveal>
        <Suspense fallback={null}>
          {/* Both read the query string, so they share the page's one
              Suspense boundary. */}
          <BookingBackToSessions />
          <BookingWizard
            initialCategories={bookableCategories}
            bookingLanguages={parseBookingLanguages(settingsRow?.booking_languages)}
            promoCodesEnabled={promoRow?.promo_codes_enabled === true}
            cancellationRefundHours={
              typeof cancelRow?.online_cancellation_refund_hours === "number"
                ? cancelRow.online_cancellation_refund_hours
                : CANCELLATION_FULL_REFUND_HOURS
            }
            bookingLeadTimeHours={
              typeof leadRow?.online_booking_lead_time_hours === "number"
                ? leadRow.online_booking_lead_time_hours
                : BOOKING_LEAD_TIME_HOURS
            }
          />
        </Suspense>
        {/* Outside the wizard card, bottom-right. /book deliberately hides
            the site nav (see NAV_HIDDEN_ROUTES) so a stray link can't lose
            someone's booking progress mid-payment, which left the page with
            no way out at all -- this is the one deliberate exit, placed
            clear of the wizard's own Back/Continue controls so it can't be
            hit by mistake. Sits here rather than inside BookingWizard so it
            shows for every one of the wizard's states (loading, in-progress,
            email-confirmation, paid) without being repeated four times. */}
        <BookingExitLink />
      </div>
    </section>
  );
}
