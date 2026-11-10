import localFont from "next/font/local";

// The notebook's handwriting: Caveat (SIL Open Font License), self-hosted
// beside Inter and Plus Jakarta Sans for the same reason they are -- no
// build-time or run-time request to Google. Used for the cover, the date at
// the top of a page and a page's headings; body text stays in the app's own
// face, because a diary somebody has to squint at is not a better diary.
//
// Not preloaded: it is needed only once the notebook is opened, and a
// preload on every dashboard page would be a download most visits never use.
export const notebookHand = localFont({
  src: "../../../app/fonts/caveat-latin-var.woff2",
  variable: "--font-notebook",
  weight: "400 700",
  display: "swap",
  preload: false,
});
