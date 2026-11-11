import WordRollLoader from "@/components/system/WordRollLoader";

/**
 * The wait inside a pop-up, sheet or drawer while its content is fetched:
 * the word-roll loader centred in a block tall enough that the pop-up has
 * its shape from the first frame.
 *
 * One loader, never a loader plus grey placeholder blocks. The admin's
 * detail sheet used to put a small loader at the top and three grey bars
 * below it, which read as the top half of the pop-up loading and the rest
 * broken; the purchase and visit pop-ups showed a tiny "Loading..." in a
 * corner of an otherwise empty sheet. Every pop-up that waits uses this.
 */
export default function PopupLoading({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      data-testid="popup-loading"
      className={`flex min-h-[16rem] w-full items-center justify-center py-10 ${className}`}
    >
      <WordRollLoader label={label} />
    </div>
  );
}
