export function formatSlotTime(slotTime: string | null, timezone: string | null) {
  if (!slotTime) return "Slot to be confirmed";
  const date = new Date(slotTime);
  if (!timezone) return date.toLocaleString();
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
}
