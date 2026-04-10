import { ValidationError } from "../models/errors.js";

export type Period = "day" | "week" | "month";

interface DateRange {
  start: string;
  end: string;
}

const VALID_PERIODS: ReadonlySet<string> = new Set(["day", "week", "month"]);

export function validatePeriod(period: string): asserts period is Period {
  if (!VALID_PERIODS.has(period)) {
    throw new ValidationError("invalid period: must be day, week, or month");
  }
}

export function resolvePeriod(period: Period, referenceDate?: Date): DateRange {
  const ref = referenceDate ?? new Date();

  switch (period) {
    case "day":
      return resolveDay(ref);
    case "week":
      return resolveWeek(ref);
    case "month":
      return resolveMonth(ref);
  }
}

function resolveDay(ref: Date): DateRange {
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function resolveWeek(ref: Date): DateRange {
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  // getUTCDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
  // We want Monday as start of week
  const dayOfWeek = start.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setUTCDate(start.getUTCDate() - daysFromMonday);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function resolveMonth(ref: Date): DateRange {
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
