const UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/** IEC units, one decimal above bytes: `1.5 MiB` (design: file sizes). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value.toString()} B` : `${value.toFixed(1)} ${UNITS[unit] ?? "B"}`;
}

/** A short local date, `Jan 2, 2026`, or the time for today. Empty for a missing date. */
export function formatModified(iso: string, now: Date = new Date()): string {
  if (iso === "") return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}
