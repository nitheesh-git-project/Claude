// Initials for the avatar stack on the "Qualified physiotherapists" tile.
//
// That tile used to draw four invented people ("AK", "PS", "RM", "NJ") whether
// or not the clinic had published a single therapist profile -- a team that
// does not exist, on the tile that claims a real one. It now draws the initials
// of profiles that are actually on /team, and nothing when there are none.
// Dependency-free so the rule is unit-tested.

const HONORIFICS = new Set(["dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "prof", "prof."]);

/** "Dr. Pooja Sharma" -> "PS"; a single name -> its first letter. */
export function initialsFor(fullName: string | null | undefined): string {
  const words = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w.toLowerCase()));
  if (words.length === 0) return "";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Up to `max` distinct, non-empty initials, in the order given. */
export function teamInitials(names: (string | null | undefined)[], max = 4): string[] {
  const out: string[] = [];
  for (const name of names) {
    const initials = initialsFor(name);
    if (initials && !out.includes(initials)) out.push(initials);
    if (out.length >= max) break;
  }
  return out;
}
