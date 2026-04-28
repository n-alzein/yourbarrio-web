import { formatTime, toObject } from "@/lib/business/profileUtils";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_LABELS = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};
const LEGACY_HOURS_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
const DEFAULT_PICKUP_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE ||
  process.env.APP_TIMEZONE ||
  "America/Los_Angeles";
const MINIMUM_PICKUP_LEAD_MINUTES = 30;

function resolveTimeZone(timeZone, fallbackTimeZone = DEFAULT_PICKUP_TIMEZONE) {
  const candidate =
    typeof timeZone === "string" && timeZone.trim() ? timeZone.trim() : fallbackTimeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallbackTimeZone;
  }
}

function parseLegacyTimeMatch(match) {
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2] || "0", 10);
  const period = String(match[3] || "").toLowerCase();

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseLegacyHours(value) {
  if (typeof value !== "string") return null;
  const matches = [...value.matchAll(LEGACY_HOURS_RE)];
  if (matches.length < 2) return null;

  const open = parseLegacyTimeMatch(matches[0]);
  const close = parseLegacyTimeMatch(matches[1]);
  if (!open || !close) return null;

  return { open, close, isClosed: false };
}

function parseTimeToMinutes(value) {
  if (typeof value !== "string" || !/^\d{1,2}:\d{2}$/.test(value.trim())) return null;
  const [hourText, minuteText] = value.trim().split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function getNormalizedDayHours(hours, key) {
  const raw = hours?.[key];
  if (!raw) return null;

  if (typeof raw === "string") {
    if (raw.trim().toLowerCase() === "closed") return { isClosed: true };
    const parsed = parseLegacyHours(raw);
    if (!parsed) return null;
    const openMinutes = parseTimeToMinutes(parsed.open);
    const closeMinutes = parseTimeToMinutes(parsed.close);
    if (openMinutes === null || closeMinutes === null) return null;
    return {
      isClosed: false,
      open: parsed.open,
      close: parsed.close,
      openMinutes,
      closeMinutes,
      overnight: closeMinutes <= openMinutes,
    };
  }

  if (typeof raw !== "object") return null;
  if (raw.isClosed === true) return { isClosed: true };

  const open = typeof raw.open === "string" ? raw.open.trim() : "";
  const close = typeof raw.close === "string" ? raw.close.trim() : "";
  const openMinutes = parseTimeToMinutes(open);
  const closeMinutes = parseTimeToMinutes(close);

  if (openMinutes === null || closeMinutes === null) return null;

  return {
    isClosed: false,
    open,
    close,
    openMinutes,
    closeMinutes,
    overnight: closeMinutes <= openMinutes,
  };
}

function getWeekSchedule(hoursValue) {
  const hours = toObject(hoursValue);
  const byDay = {};
  let hasStructuredHours = false;

  for (const key of WEEKDAY_KEYS) {
    const normalized = getNormalizedDayHours(hours, key);
    byDay[key] = normalized;
    if (normalized && normalized.isClosed !== true) {
      hasStructuredHours = true;
    }
  }

  return { byDay, hasStructuredHours };
}

function getZonedParts(now, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayIndex = WEEKDAY_KEYS.findIndex(
    (key) => WEEKDAY_LABELS[key].slice(0, 3).toLowerCase() === String(values.weekday || "").toLowerCase()
  );

  return {
    weekdayIndex,
    minutes: Number(values.hour || 0) * 60 + Number(values.minute || 0),
  };
}

function getNextOpenLabel(offset, weekdayKey) {
  if (offset === 0) return "Pickup today";
  if (offset === 1) return "Pickup tomorrow";
  return `Pickup ${WEEKDAY_LABELS[weekdayKey] || "soon"}`;
}

export function getPickupAvailabilityLabel({
  pickupAvailable,
  hours,
  timeZone,
  fallbackTimeZone = DEFAULT_PICKUP_TIMEZONE,
  now = new Date(),
  minimumLeadMinutes = MINIMUM_PICKUP_LEAD_MINUTES,
  includeClosingTime = true,
}) {
  if (!pickupAvailable) {
    return "Pickup currently unavailable";
  }

  const { byDay, hasStructuredHours } = getWeekSchedule(hours);
  if (!hasStructuredHours) {
    return "Pickup availability confirmed by shop";
  }

  const resolvedTimeZone = resolveTimeZone(timeZone, fallbackTimeZone);
  const zonedNow = getZonedParts(now instanceof Date ? now : new Date(now), resolvedTimeZone);
  const todayIndex = zonedNow.weekdayIndex;

  if (todayIndex < 0) {
    return "Pickup availability confirmed by shop";
  }

  const todayKey = WEEKDAY_KEYS[todayIndex];
  const previousKey = WEEKDAY_KEYS[(todayIndex + 6) % 7];
  const nowMinutes = zonedNow.minutes;
  const todayHours = byDay[todayKey];
  const previousHours = byDay[previousKey];

  if (
    previousHours &&
    previousHours.isClosed !== true &&
    previousHours.overnight &&
    nowMinutes < previousHours.closeMinutes
  ) {
    const remaining = previousHours.closeMinutes - nowMinutes;
    if (remaining > minimumLeadMinutes) {
      return includeClosingTime
        ? `Pickup today until ${formatTime(previousHours.close)}`
        : "Pickup today";
    }
  }

  if (todayHours && todayHours.isClosed !== true) {
    if (todayHours.overnight) {
      if (nowMinutes >= todayHours.openMinutes) {
        const remaining = 24 * 60 - nowMinutes + todayHours.closeMinutes;
        if (remaining > minimumLeadMinutes) {
          return includeClosingTime
            ? `Pickup today until ${formatTime(todayHours.close)}`
            : "Pickup today";
        }
      }
    } else if (
      nowMinutes >= todayHours.openMinutes &&
      nowMinutes < todayHours.closeMinutes
    ) {
      const remaining = todayHours.closeMinutes - nowMinutes;
      if (remaining > minimumLeadMinutes) {
        return includeClosingTime
          ? `Pickup today until ${formatTime(todayHours.close)}`
          : "Pickup today";
      }
    }
  }

  for (let offset = 0; offset < 7; offset += 1) {
    const weekdayKey = WEEKDAY_KEYS[(todayIndex + offset) % 7];
    const hoursForDay = byDay[weekdayKey];
    if (!hoursForDay || hoursForDay.isClosed === true) continue;

    const duration = hoursForDay.overnight
      ? 24 * 60 - hoursForDay.openMinutes + hoursForDay.closeMinutes
      : hoursForDay.closeMinutes - hoursForDay.openMinutes;
    if (duration <= minimumLeadMinutes) continue;

    if (offset === 0) {
      if (nowMinutes < hoursForDay.openMinutes) {
        return "Pickup today";
      }
      continue;
    }

    return getNextOpenLabel(offset, weekdayKey);
  }

  return "Pickup currently unavailable";
}

export { DEFAULT_PICKUP_TIMEZONE };
