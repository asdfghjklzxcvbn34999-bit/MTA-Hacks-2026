export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function toIso(date: Date): string {
  return date.toISOString();
}

export function prettyDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
