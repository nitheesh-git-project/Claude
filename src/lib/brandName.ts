// The name a phone header can show whole.
//
// `site_name` is admin-set and defaults to "MoveRestore Physiotherapy": beside
// the logo and the menu button on a 390px phone that is wider than the room, so
// it ended in an ellipsis ("MoveRestore Physio...") on every page. The header
// shows the first word below `sm` -- the brand proper -- and the full name from
// there up. A one-word name is returned untouched, and so is a name whose first
// word is too short to stand for it ("Dr Pooja Physio").
export function shortBrandName(siteName: string): string {
  const name = siteName.trim();
  const words = name.split(/\s+/);
  if (words.length < 2) return name;
  return words[0].length >= 5 ? words[0] : name;
}
