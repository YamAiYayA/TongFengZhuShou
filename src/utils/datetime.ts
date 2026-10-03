/** Local calendar helpers. Stored DB values remain ISO strings. */

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function dateKeyLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseHmm(hmm: string): { hours: number; minutes: number } {
  const [h, m] = hmm.split(':').map((x) => Number(x));
  return { hours: h || 0, minutes: m || 0 };
}

export function combineDateAndTime(base: Date, hmm: string): Date {
  const { hours, minutes } = parseHmm(hmm);
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function startOfLocalDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfLocalDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function addSeconds(d: Date, seconds: number): Date {
  return new Date(d.getTime() + seconds * 1000);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
}

export function formatTimeHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatTimeHms(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDateTimeHm(d: Date): string {
  return `${dateKeyLocal(d)} ${formatTimeHm(d)}`;
}

export function formatDateTimeHms(d: Date): string {
  return `${dateKeyLocal(d)} ${formatTimeHms(d)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Format remaining seconds as H:MM:SS or M:SS (always show seconds). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${minutes}:${pad2(seconds)}`;
}
