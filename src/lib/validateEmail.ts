// Stricter-than-HTML5 email validation, run at submit time on the
// account-creation forms. HTML5's type="email" pattern is much looser than
// this (e.g. it accepts consecutive dots, single-label domains) — this
// mirrors what mailbox providers actually reject.
const LOCAL_PART_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]+$/;
const DOMAIN_LABEL_RE = /^[A-Za-z0-9-]+$/;

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || email.indexOf("@", atIndex + 1) !== -1) return false; // exactly one @

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length > 64) return false;
  if (!LOCAL_PART_RE.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;

  if (!domain.includes(".")) return false;
  const labels = domain.split(".");
  if (labels.some((label) => label.length === 0)) return false; // no empty label (leading/trailing/consecutive dots)
  for (const label of labels) {
    if (!DOMAIN_LABEL_RE.test(label)) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[A-Za-z]+$/.test(tld)) return false;

  return true;
}
