const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export function normalizeUrl(value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

export function formatTime(value) {
  if (!value) return "";
  const [hourStr, minuteStr = "00"] = String(value).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return String(value);
  const hour12 = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return minute === 0 ? `${hour12} ${ampm}` : `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

export function formatHoursValue(dayData) {
  if (!dayData) return "";
  if (typeof dayData === "string") return dayData;
  if (typeof dayData === "object") {
    if (dayData.isClosed) return "Closed";
    if (dayData.open && dayData.close) {
      return `${formatTime(dayData.open)} - ${formatTime(dayData.close)}`;
    }
  }
  return "";
}

export function parseHours(value) {
  if (!value) return [];
  let hoursObj = value;
  if (typeof value === "string") {
    try {
      hoursObj = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!hoursObj || typeof hoursObj !== "object") return [];
  return DAYS.map((day) => ({
    ...day,
    value: formatHoursValue(hoursObj?.[day.key]),
  })).filter((entry) => entry.value);
}

export function toObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}
