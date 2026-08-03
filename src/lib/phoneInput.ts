// Shared onInput handler for every phone/WhatsApp field in the app —
// strips anything that isn't a digit, +, -, ( ), or space as the user
// types, rather than only validating on submit.
export function sanitizePhoneInput(e: React.FormEvent<HTMLInputElement>) {
  e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+\-\s()]/g, "");
}
