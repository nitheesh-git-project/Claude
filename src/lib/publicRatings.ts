// How many ratings the public home page needs before it shows an average.
//
// One rating makes a "4.0" that proves nothing and reads as inflated, so the
// stats strip waits until there are a few. Dependency-free, unit-tested.

export const MIN_PUBLIC_RATINGS = 3;

/** "1 rating", "2 ratings". */
export function ratingCountLabel(count: number): string {
  return `${count} rating${count === 1 ? "" : "s"}`;
}
