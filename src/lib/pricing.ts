export const SESSION_FEE_INR = 1999;
export const SESSION_FEE_PAISE = SESSION_FEE_INR * 100;

// Used for bookings that don't go through a treatment category (e.g.
// hospital-referred patients), same as SESSION_FEE_* above.
export const BASE_DURATION_MINUTES = 60;

// Cancellation policy: a paid session cancelled at least this many hours
// before its scheduled slot_time gets a full refund. Cancelling inside that
// window gets none — by then the therapist's slot is essentially unfillable,
// so refunding in full would leave the business eating a booked-and-blocked
// slot with no time to refill it.
export const CANCELLATION_FULL_REFUND_HOURS = 24;
