const DAY_IN_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, "0");
}

export function getDefaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function normalizeTimeZone(timeZone) {
  const fallback = getDefaultTimeZone();

  if (!timeZone) {
    return fallback;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch (_error) {
    return fallback;
  }
}

export function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseDateString(dateString) {
  if (!isValidDateString(dateString)) {
    throw new Error(`Invalid date string: ${dateString}`);
  }

  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

export function formatDateParts(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function toUtcDate(dateString) {
  const { year, month, day } = parseDateString(dateString);
  return new Date(Date.UTC(year, month - 1, day));
}

export function fromDateToString(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getZonedDateParts(date = new Date(), timeZone = getDefaultTimeZone()) {
  const safeTimeZone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .reduce((accumulator, part) => {
      accumulator[part.type] = Number(part.value);
      return accumulator;
    }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

export function getTodayDateString(timeZone = getDefaultTimeZone()) {
  return formatDateParts(getZonedDateParts(new Date(), normalizeTimeZone(timeZone)));
}

export function addDays(dateString, amount) {
  const date = toUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromDateToString(date);
}

export function diffDays(fromDateString, toDateString) {
  return Math.round((toUtcDate(toDateString) - toUtcDate(fromDateString)) / DAY_IN_MS);
}

export function compareDateStrings(left, right) {
  return left.localeCompare(right);
}

export function uniqueDateStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && isValidDateString(value)))].sort(compareDateStrings);
}

export function getWeekday(dateString) {
  return toUtcDate(dateString).getUTCDay();
}

export function isWeekend(dateString) {
  const weekday = getWeekday(dateString);
  return weekday === 0 || weekday === 6;
}

export function getWeekdayLabel(weekday) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday] || "";
}

export function getMonthKey(dateString) {
  return dateString.slice(0, 7);
}

export function splitMonthKey(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }

  const [year, month] = monthKey.split("-").map(Number);
  return { year, month };
}

export function getCurrentMonthKey(timeZone = getDefaultTimeZone()) {
  const { year, month } = getZonedDateParts(new Date(), normalizeTimeZone(timeZone));
  return `${year}-${pad(month)}`;
}

export function shiftMonth(monthKey, delta) {
  const { year, month } = splitMonthKey(monthKey);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

export function getMonthLabel(monthKey) {
  const { year, month } = splitMonthKey(monthKey);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function getMonthRange(monthKey) {
  const { year, month } = splitMonthKey(monthKey);
  const firstDate = `${year}-${pad(month)}-01`;
  const lastDate = fromDateToString(new Date(Date.UTC(year, month, 0)));
  return { firstDate, lastDate };
}

export function countDatesInRange(dateStrings, startDate, endDate) {
  return dateStrings.filter((dateString) => dateString >= startDate && dateString <= endDate).length;
}

export function buildCalendarCells(monthKey, workedSet, todayDate, selectedDate, dateMetaMap = {}) {
  const { year, month } = splitMonthKey(monthKey);
  const firstDate = `${year}-${pad(month)}-01`;
  const firstWeekday = getWeekday(firstDate);
  const lastDay = Number(getMonthRange(monthKey).lastDate.slice(-2));
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      key: `blank-${index}`,
      isBlank: true,
    });
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const dateString = `${year}-${pad(month)}-${pad(day)}`;
    cells.push({
      key: dateString,
      dateString,
      label: String(day),
      isBlank: false,
      isWorked: workedSet.has(dateString),
      isToday: dateString === todayDate,
      isSelected: dateString === selectedDate,
      meta: dateMetaMap[dateString] ?? null,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `blank-tail-${cells.length}`,
      isBlank: true,
    });
  }

  return cells;
}

export function formatLongDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(dateString));
}

export function daysAgoLabel(dateString, todayDate) {
  const distance = diffDays(dateString, todayDate);

  if (distance === 0) return "today";
  if (distance === 1) return "yesterday";
  return `${distance} days ago`;
}
