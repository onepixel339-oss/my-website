/**
 * src/lib/timezone.ts
 * ---------------------------------------------------------------------------
 * Timezone-aware "start of today" helper.
 *
 * The "Bottles exchanged today" counter must reset at midnight in a fixed
 * local timezone — Africa/Cairo (UTC+2 / +3 with DST) — rather than at the
 * server's UTC midnight, so the number reflects the audience's lived day.
 *
 * Computing "midnight local" from a UTC instant is fiddly because the offset
 * can change across a DST boundary. The robust, dependency-free approach is:
 *   1. Read the wall-clock date parts (Y/M/D) for `now` in the target zone
 *      via Intl.DateTimeFormat (handles DST internally).
 *   2. Express that local date at 00:00:00 as a UTC instant (midnightUTC).
 *   3. Find the zone's UTC offset AT that midnight instant (again via Intl),
 *      and subtract it: the result is the true UTC instant of local midnight.
 *
 * This is the canonical pattern recommended when no timezone DB library
 * (e.g. luxon/date-fns-tz) is available, and it is DST-correct.
 * -------------------------------------------------------------------------
 */

/**
 * Returns the UTC offset (in milliseconds) of `timeZone` at the given UTC
 * instant. Positive east of UTC (e.g. Cairo +02:00 → +7_200_000).
 */
function zoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // `hour: "24"` can appear for midnight in some engines; normalise to 0.
  const hour = get("hour") % 24;
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUTC - date.getTime();
}

/**
 * The UTC Date corresponding to 00:00:00 (midnight) at the start of "today"
 * in `timeZone` (defaults to Africa/Cairo). DST-correct.
 */
export function startOfTodayInZone(
  timeZone = "Africa/Cairo",
  now: Date = new Date(),
): Date {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const year = get("year");
  const month = get("month");
  const day = get("day");

  // Midnight of today's local date, naively expressed as a UTC instant.
  const midnightUTC = Date.UTC(year, month - 1, day, 0, 0, 0);
  // The zone offset at that midnight instant (handles DST).
  const offset = zoneOffsetMs(timeZone, new Date(midnightUTC));
  return new Date(midnightUTC - offset);
}
