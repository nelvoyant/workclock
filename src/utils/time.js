// src/utils/time.js

// Parse "HH:MM" to minutes since midnight
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Compute the current local time string and status for a timezone.
 * Status:
 *  - "working"  → now is within [start, end - 60)
 *  - "lastHour" → now is within [end - 60, end)
 *  - "off"      → otherwise
 *
 * @param {string} timeZone IANA zone like "America/Toronto"
 * @param {string} start    Workday start, "HH:MM" (24h). Default "09:00"
 * @param {string} end      Workday end,   "HH:MM" (24h). Default "17:00"
 * @returns {{ timeStr: string, status: "working"|"lastHour"|"off" }}
 */
export function computeStatusForNow(
  timeZone,
  start = "09:00",
  end = "17:00",
  workDays = ["Mon", "Tue", "Wed", "Thu", "Fri"]
) {
  if (!timeZone) {
    return { timeStr: "—", status: "off" };
  }

  const now = new Date();

  // Local time string for display
  const timeStr = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(now);

  // Check day of week
  const dayStr = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    timeZone,
  }).format(now); // e.g., "Mon"

  if (!workDays.includes(dayStr)) {
    return { timeStr, status: "off" };
  }

  const hhmm = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);
  const curMin = toMinutes(hhmm);

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const lastHourMin = Math.max(startMin, endMin - 60);

  let status = "off";
  if (curMin >= startMin && curMin < lastHourMin) status = "working";
  else if (curMin >= lastHourMin && curMin < endMin) status = "lastHour";

  return { timeStr, status };
}