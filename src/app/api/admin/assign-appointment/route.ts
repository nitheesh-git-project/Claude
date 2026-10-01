import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { formatAddressOneLine, visitAddressFromAppointment } from "@/lib/formatAddress";
import {
  claimTherapistSlot,
  describeClaimFailure,
} from "@/lib/claimTherapistSlot";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    therapistId?: string;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, therapistId } = body;
  if (!appointmentId || !therapistId) {
    return NextResponse.json(
      { error: "Missing appointmentId or therapistId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Independent lookups -- run in parallel rather than sequentially, since
  // each Supabase round trip in a slower network environment adds real,
  // user-visible latency to this button (see appointment_reassignment_log's
  // usage below for why speed matters here: a slow admin action button is
  // more likely to be interrupted by a page reload mid-request).
  const [{ data: therapist }, { data: appointment }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, active")
      .eq("id", therapistId)
      .eq("role", "therapist")
      .eq("approved", true)
      .single(),
    admin
      .from("appointments")
      .select(
        "patient_id, payment_status, slot_time, duration_minutes, timezone, therapist_id, status, package_purchase_id"
      )
      .eq("id", appointmentId)
      .single(),
  ]);

  // The home-visit columns in their own query: they are newer than this
  // route, and folding them into the select above would mean an unknown
  // column breaks assignment for every ordinary online session too. A null
  // here degrades to "treat it as an online session", which is exactly the
  // behaviour this route had before home visits existed.
  const { data: visit } = await admin
    .from("appointments")
    .select(
      "visit_mode, home_visit_purchase_id, visit_address_line1, visit_address_line2, visit_landmark, visit_city, visit_state, visit_pincode, visit_latitude, visit_longitude, visit_access_notes"
    )
    .eq("id", appointmentId)
    .maybeSingle();

  const isHomeVisit = visit?.visit_mode === "home_visit";

  // Pay-later terms in their own query, and for the same reason as the block
  // above: `payment_terms` is newer than this route, so folding it into the
  // main select would let one unmigrated database break assignment for every
  // ordinary session. Absent, it reads as `prepaid`, which is what every
  // session was before this column existed.
  const { data: terms } = await admin
    .from("appointments")
    .select("payment_terms")
    .eq("id", appointmentId)
    .maybeSingle();

  // A therapist finishing at one address cannot be at another minutes
  // later, and time overlap is the only signal available -- the app holds
  // no distance data. Online assignments pass 0 and behave exactly as
  // before.
  let travelBufferMinutes = 0;
  if (isHomeVisit) {
    const { data: bufferRow } = await admin
      .from("site_settings")
      .select("home_visit_travel_buffer_minutes")
      .maybeSingle();
    travelBufferMinutes =
      bufferRow?.home_visit_travel_buffer_minutes ??
      DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes;
  }

  if (!therapist) {
    return NextResponse.json(
      { error: "That therapist is not an approved therapist" },
      { status: 400 }
    );
  }
  // Always a fresh assignment (no existing state to preserve), so a
  // suspended therapist is a hard block here - unlike update-appointment,
  // which has to tolerate re-saving a session that's already assigned to
  // one.
  if (!therapist.active) {
    return NextResponse.json(
      { error: "That therapist is suspended and can't be assigned new sessions." },
      { status: 400 }
    );
  }

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  // Only flip to "confirmed" once the patient has actually paid - otherwise
  // assigning a therapist would silently confirm an unpaid booking. If it's
  // still unpaid, the therapist is assigned but status stays "requested";
  // /api/razorpay/verify auto-confirms it the moment payment succeeds.
  // ...or the patient is one the clinic has agreed to be paid afterwards. A
  // pay-later booking is never going to be "paid" before it happens, so
  // without this it would sit at `requested` for ever -- and only a
  // `confirmed` session can be completed, which is the step that creates the
  // debt, the revenue and the therapist's share.
  const shouldConfirm =
    appointment.payment_status === "paid" || terms?.payment_terms === "pay_later";

  // The whole reservation -- overlap test, compare-and-set and write -- in
  // one statement, under a row lock on the therapist.
  //
  // This replaces a check, a write, a re-check and a revert. That sequence
  // could not hold the property it existed for: two admins assigning the
  // same therapist to overlapping slots both passed the first check before
  // either write committed. And the revert carried a bug of its own -- it
  // rewrote `therapist_id` with no compare-and-set, so a *third* admin's
  // assignment landing in between was silently overwritten by a request
  // that had already lost its own race. There is nothing to revert now,
  // because there is no window to revert from.
  const claim = await claimTherapistSlot(admin, {
    appointmentId,
    therapistId,
    // Two different assertions, kept apart on purpose: an unassigned
    // session is claimed only while still unassigned, and a deliberate
    // reassignment only while the therapist it was read with is still on it.
    expectUnassigned: appointment.therapist_id === null,
    expectedTherapistId: appointment.therapist_id,
    bufferMinutes: travelBufferMinutes,
    confirm: shouldConfirm,
  });

  if (!claim.ok) {
    const { status, error } = describeClaimFailure(claim);
    return NextResponse.json({ error }, { status });
  }

  if (appointment.therapist_id !== therapistId) {
    const { error: logError } = await admin.from("appointment_reassignment_log").insert({
      appointment_id: appointmentId,
      changed_by: adminUser.id,
      old_therapist_id: appointment.therapist_id,
      new_therapist_id: therapistId,
    });
    if (logError) {
      console.error("Failed to record appointment_reassignment_log entry:", logError);
    }
  }

  // Package continuity: the first therapist ever assigned to a session on
  // a package purchase locks onto that purchase -- every later session on
  // the same purchase then auto-assigns them (see
  // src/lib/bookPackageSession.ts), which is the whole point of selling
  // "one therapist for your programme". Only fires once per purchase
  // (locked_therapist_id starts null and this only ever sets it, never
  // overwrites it -- see /api/admin/reassign-package-therapist for
  // deliberately moving a locked purchase to someone else) and only when
  // both the package itself and the site-wide switch allow locking.
  if (appointment.package_purchase_id) {
    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("id, package_id, locked_therapist_id")
      .eq("id", appointment.package_purchase_id)
      .single();
    if (purchase && !purchase.locked_therapist_id) {
      const [{ data: packageRow }, { data: settingsRow }] = await Promise.all([
        admin
          .from("treatment_category_packages")
          .select("therapist_locked")
          .eq("id", purchase.package_id)
          .maybeSingle(),
        admin.from("site_settings").select("package_therapist_lock_enabled").maybeSingle(),
      ]);
      const packageAllowsLock = packageRow?.therapist_locked !== false;
      const siteAllowsLock = settingsRow?.package_therapist_lock_enabled !== false;
      if (packageAllowsLock && siteAllowsLock) {
        // CAS on locked_therapist_id staying null -- two appointments on
        // the same purchase being assigned near-simultaneously (e.g. an
        // admin double-clicking, or assigning session 1 while a bulk
        // schedule is mid-flight) must not both "win" the lock.
        const { data: lockClaimed, error: lockError } = await admin
          .from("patient_package_purchases")
          .update({ locked_therapist_id: therapistId })
          .eq("id", purchase.id)
          .is("locked_therapist_id", null)
          .select("id")
          .maybeSingle();
        if (lockError) {
          console.error("Failed to lock package therapist for purchase", purchase.id, lockError);
        } else if (lockClaimed) {
          const { error: lockEventError } = await admin.from("package_purchase_events").insert({
            purchase_id: purchase.id,
            event_type: "therapist_locked",
            actor_id: adminUser.id,
            appointment_id: appointmentId,
            detail: { therapistId },
          });
          if (lockEventError) {
            console.error(
              "Failed to log therapist_locked event for purchase",
              purchase.id,
              lockEventError
            );
          }
        }
      }
    }
  }

  // The home-visit twin of the package lock above, against its own
  // purchases table. Same contract: set once, never overwritten, CAS'd on
  // staying null so two near-simultaneous assignments on one programme
  // can't both win it.
  if (visit?.home_visit_purchase_id) {
    const { data: purchase } = await admin
      .from("home_visit_package_purchases")
      .select("id, package_id, locked_therapist_id")
      .eq("id", visit.home_visit_purchase_id)
      .single();
    if (purchase && !purchase.locked_therapist_id) {
      const { data: packageRow } = await admin
        .from("home_visit_packages")
        .select("therapist_locked")
        .eq("id", purchase.package_id)
        .maybeSingle();
      // No site-wide switch here, unlike the online packages: continuity on
      // a home visit is about a stranger entering someone's home, which is
      // the package's own promise to make or not, not a platform default to
      // override.
      if (packageRow?.therapist_locked !== false) {
        const { data: lockClaimed, error: lockError } = await admin
          .from("home_visit_package_purchases")
          .update({ locked_therapist_id: therapistId })
          .eq("id", purchase.id)
          .is("locked_therapist_id", null)
          .select("id")
          .maybeSingle();
        if (lockError) {
          console.error("Failed to lock home visit therapist for purchase", purchase.id, lockError);
        } else if (lockClaimed) {
          const { error: lockEventError } = await admin
            .from("home_visit_purchase_events")
            .insert({
              purchase_id: purchase.id,
              event_type: "therapist_locked",
              actor_id: adminUser.id,
              appointment_id: appointmentId,
              detail: { therapistId },
            });
          if (lockEventError) {
            console.error(
              "Failed to log therapist_locked event for home visit purchase",
              purchase.id,
              lockEventError
            );
          }
        }
      }
    }
  }

  // Past the post-write conflict re-check above -- the assignment (and any
  // status: "confirmed") is confirmed to have actually stuck, so it's safe
  // to create the Meet event now.
  if (shouldConfirm && appointment.slot_time) {
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId,
      patientId: appointment.patient_id,
      therapistId,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      timezone: appointment.timezone,
      // A home visit's event carries the street address and no Meet link.
      // It is not optional: Calendar's invite email is the only outbound
      // message this platform sends, so skipping it would leave the patient
      // with no confirmation that someone is coming to their home.
      visitMode: isHomeVisit ? "home_visit" : "online",
      location: isHomeVisit && visit ? formatAddressOneLine(visitAddressFromAppointment(visit)) : null,
      description:
        isHomeVisit && visit?.visit_access_notes
          ? `Access notes: ${visit.visit_access_notes}`
          : null,
    });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "session.assign",
    targetId: appointmentId, details: { therapistId },
  });

  return NextResponse.json({ success: true });
}
