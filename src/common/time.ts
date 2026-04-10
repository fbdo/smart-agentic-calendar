export function toUTC(date: Date): string {
  return date.toISOString();
}

export function parseUTC(isoString: string): Date {
  if (!isoString) {
    throw new Error("Invalid ISO 8601 string: empty");
  }
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO 8601 string: ${isoString}`);
  }
  return date;
}

export function isValidISO8601(str: string): boolean {
  if (!str) return false;
  const date = new Date(str);
  if (isNaN(date.getTime())) return false;
  // Verify it round-trips reasonably (rejects things like month 13)
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  if (!isoRegex.test(str)) return false;
  // Verify the parsed date components match the input
  const [datePart] = str.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}

export function isValidTimeHHMM(str: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(str)) return false;
  const [hours, minutes] = str.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function isValidDateYYYYMMDD(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [year, month, day] = str.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}

export function nowUTC(): string {
  return new Date().toISOString();
}

export function startOfDay(isoString: string): string {
  const date = parseUTC(isoString);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export function endOfDay(isoString: string): string {
  const date = parseUTC(isoString);
  date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}

export function addMinutes(isoString: string, minutes: number): string {
  const date = parseUTC(isoString);
  date.setTime(date.getTime() + minutes * 60_000);
  return date.toISOString();
}

export function diffMinutes(start: string, end: string): number {
  const startDate = parseUTC(start);
  const endDate = parseUTC(end);
  return (endDate.getTime() - startDate.getTime()) / 60_000;
}
