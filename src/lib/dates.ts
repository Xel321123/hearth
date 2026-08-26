/** Human-friendly relative date for a YYYY-MM-DD value. Pure & testable. */
export function formatRelativeDate(dateStr: string, now: Date = new Date()): string {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays < 0) return `${-diffDays}d ago`;
  if (diffDays < 30) return `in ${diffDays}d`;
  return target.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Today's date as YYYY-MM-DD (local timezone). */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
