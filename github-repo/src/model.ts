// Event model, Full Calendar-compatible frontmatter parsing, and recurrence expansion.
// Dates are "YYYY-MM-DD" strings in local time; times are minutes since midnight.

export interface Calendar {
  name: string; // sub-folder name under the root folder
  path: string; // full folder path
  color: string; // hex color
}

// Raw event as stored in a note's frontmatter (Full Calendar schema).
export interface RawEvent {
  path: string;
  file?: unknown; // the app's live file handle (TFile), set by the plugin
  calendar: Calendar;
  title: string;
  allDay: boolean;
  startTime: number | null; // minutes
  endTime: number | null;
  type: "single" | "recurring" | "rrule";
  // single
  date?: string;
  endDate?: string | null;
  completed?: string | false | null;
  // recurring
  daysOfWeek?: number[]; // 0=Sunday .. 6=Saturday
  startRecur?: string;
  endRecur?: string;
  // rrule
  startDate?: string;
  rrule?: string;
  skipDates?: string[]; // rrule exceptions; also honored on "recurring" as an extension (Full Calendar ignores it)
  // Apple-Calendar-style extras (extra frontmatter keys; Full Calendar ignores them)
  location?: string;
  url?: string;
  alerts: number[]; // up to 4, minutes before start (0 = at start), largest first
  // Reminders (kind "reminder") reuse this shape so they show up in the calendar.
  kind?: "event" | "reminder";
  flagged?: boolean;
  priority?: "none" | "low" | "medium" | "high";
  reminderRepeat?: "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly";
  created?: string;
}

// One occurrence on the calendar.
export interface EventInstance {
  raw: RawEvent;
  title: string;
  calendar: Calendar;
  date: string; // start day
  endDate: string; // inclusive last day (same as date for one-day events)
  allDay: boolean; // also true for multi-day timed events (drawn as a bar)
  start: number; // minutes, 0 for all-day
  end: number; // minutes
  multiDay: boolean;
}

// ---------- date helpers ----------

export function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}
export function toKey(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(2000, 0, 1);
  dt.setFullYear(y, m - 1, d);
  return dt;
}
export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, dim));
  return toKey(d);
}
export function daysInMonth(y: number, m0: number): number {
  const dt = new Date(2000, 0, 1);
  dt.setFullYear(y, m0 + 1, 0);
  return dt.getDate();
}
export function dayOfWeek(key: string): number {
  return fromKey(key).getDay();
}
export function todayKey(): string {
  return toKey(new Date());
}
export function diffDays(a: string, b: string): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 86400000);
}
export function cmpKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function keyParts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}

// Accepts "YYYY-MM-DD", full ISO strings, or Date objects (YAML may parse dates).
export function normalizeDate(v: unknown): string | null {
  if (v == null || v === false) return null;
  if (v instanceof Date) return toKey(v);
  if (typeof v === "number") return toKey(new Date(v));
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isValidKey(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const k = toKey(d);
  return isValidKey(k) ? k : null;
}

// Real calendar date with a 4-digit year, so string comparison of keys stays correct.
export function isValidKey(key: string): boolean {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return y >= MIN_YEAR && y <= MAX_YEAR && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo - 1);
}
export const MIN_YEAR = 1000;
export const MAX_YEAR = 9998;
export function clampKey(key: string): string {
  if (isValidKey(key)) return key;
  return todayKey();
}

// Accepts "HH:mm", "H:mm", "h:mm a", "HH:mm:ss".
export function parseTime(v: unknown): number | null {
  if (v == null) return null;
  // Some YAML parsers read a bare 10:30 as the sexagesimal number 630 (= minutes).
  if (typeof v === "number") return v >= 0 && v <= 1440 ? Math.round(v) : null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}
export function minutesToHHMM(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
export function formatTime(min: number, hour12 = true): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  if (!hour12) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

export const WEEKDAY_LETTERS = ["U", "M", "T", "W", "R", "F", "S"]; // Full Calendar's encoding
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = DAY_NAMES.map((d) => d.slice(0, 3));

// ---------- frontmatter parsing ----------

export function parseFrontmatter(
  fm: Record<string, any> | undefined,
  path: string,
  basename: string,
  calendar: Calendar
): RawEvent | null {
  if (!fm) return null;
  const type: string = fm.type ?? "single";
  const title = typeof fm.title === "string" && fm.title.length ? fm.title : titleFromBasename(basename, type);
  const allDay = fm.allDay === true;
  const startTime = allDay ? null : parseTime(fm.startTime);
  const endTime = allDay ? null : parseTime(fm.endTime);
  const base = {
    path, calendar, title, allDay: allDay || startTime === null, startTime, endTime,
    location: cleanText(fm.location, 300),
    url: httpUrl(fm.url),
    alerts: parseAlerts(fm.alert),
  };

  if (type === "single") {
    const date = normalizeDate(fm.date) ?? dateFromBasename(basename);
    if (!date) return null;
    return {
      ...base,
      type: "single",
      date,
      endDate: normalizeDate(fm.endDate),
      completed: fm.completed ?? null,
    };
  }
  if (type === "recurring") {
    const dows = Array.isArray(fm.daysOfWeek) ? fm.daysOfWeek : [];
    const daysOfWeek = dows
      .map((d: any) => WEEKDAY_LETTERS.indexOf(String(d).trim().toUpperCase()))
      .filter((n: number) => n >= 0);
    if (!daysOfWeek.length) return null;
    const skip = Array.isArray(fm.skipDates) ? fm.skipDates.slice(0, 5000) : [];
    return {
      ...base,
      type: "recurring",
      daysOfWeek,
      startRecur: normalizeDate(fm.startRecur) ?? undefined,
      endRecur: normalizeDate(fm.endRecur) ?? undefined,
      skipDates: skip.map(normalizeDate).filter((x: string | null): x is string => !!x),
    };
  }
  if (type === "rrule") {
    const startDate = normalizeDate(fm.startDate);
    if (!startDate || typeof fm.rrule !== "string") return null;
    const skip = Array.isArray(fm.skipDates) ? fm.skipDates.slice(0, 5000) : [];
    return {
      ...base,
      type: "rrule",
      startDate,
      rrule: fm.rrule,
      skipDates: skip.map(normalizeDate).filter((x: string | null): x is string => !!x),
    };
  }
  return null;
}

// Optional free-text field: string, trimmed, control characters removed, length-capped.
function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim().slice(0, max);
  return t || undefined;
}

// Only plain web links are kept; anything else (javascript:, file:, smb:…) is dropped.
function httpUrl(v: unknown): string | undefined {
  const t = cleanText(v, 500);
  return t && /^https?:\/\/\S+$/i.test(t) ? t : undefined;
}

export const ALERT_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
export const MAX_ALERTS = 4;
function parseAlertValue(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,5}$/.test(v.trim()) ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 40320 ? Math.round(n) : null; // up to 4 weeks before
}
// `alert: 15` or `alert: [1440, 15]` (up to 4). Duplicates dropped, largest lead first.
export function parseAlerts(v: unknown): number[] {
  const list = Array.isArray(v) ? v.slice(0, 20) : v == null ? [] : [v];
  const out = [...new Set(list.map(parseAlertValue).filter((n): n is number => n != null))];
  return out.sort((a, b) => b - a).slice(0, MAX_ALERTS);
}

function titleFromBasename(basename: string, type: string): string {
  if (type === "single") return basename.replace(/^\d{4}-\d{2}-\d{2}\s*/, "");
  return basename.replace(/^\([^)]*\)\s*/, "");
}
function dateFromBasename(basename: string): string | null {
  const m = basename.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ---------- minimal RRULE support ----------
// Handles FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, BYDAY (weekly), BYMONTHDAY.
// Enough for what Full Calendar writes and for simple hand-written rules.

interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  until?: string;
  byDay?: number[];
  byMonthDay?: number[];
}

const BYDAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseRRule(text: string): Rule | null {
  // Accept "RRULE:FREQ=..." possibly preceded by DTSTART lines.
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.toUpperCase().startsWith("RRULE:") || l.toUpperCase().startsWith("FREQ="));
  if (!line) return null;
  const body = line.replace(/^RRULE:/i, "");
  const rule: Partial<Rule> = { interval: 1 };
  for (const part of body.split(";")) {
    const [k, v] = part.split("=");
    if (!k || v == null) continue;
    switch (k.toUpperCase()) {
      case "FREQ": {
        const f = v.toUpperCase();
        if (f === "DAILY" || f === "WEEKLY" || f === "MONTHLY" || f === "YEARLY") rule.freq = f;
        else return null;
        break;
      }
      case "INTERVAL":
        rule.interval = Math.min(1000, Math.max(1, parseInt(v, 10) || 1));
        break;
      case "COUNT":
        rule.count = parseInt(v, 10);
        break;
      case "UNTIL": {
        const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
        if (m && isValidKey(`${m[1]}-${m[2]}-${m[3]}`)) rule.until = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
      case "BYDAY":
        rule.byDay = [...new Set(v
          .split(",", 7)
          .map((d) => BYDAY_MAP[d.replace(/^[+-]?\d+/, "").toUpperCase()])
          .filter((n) => n !== undefined))];
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = [...new Set(v.split(",", 31).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n >= -31 && n <= 31 && n !== 0))];
        break;
    }
  }
  return rule.freq ? (rule as Rule) : null;
}

export function describeRRule(text: string): string {
  const r = parseRRule(text);
  if (!r) return "custom rule";
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[r.freq];
  return r.interval === 1 ? `every ${unit}` : `every ${r.interval} ${unit}s`;
}

// Expand an rrule between from..to (inclusive), returning day keys.
// Skips ahead arithmetically so a start date centuries ago costs nothing,
// and every loop has a hard cap so hostile rules cannot hang the app.
const MAX_INSTANCES = 2000;
const MAX_STEPS = 5000;

function expandRRule(startDate: string, rule: Rule, from: string, to: string): string[] {
  const out: string[] = [];
  if (cmpKey(startDate, to) > 0) return out;
  const limit = rule.until && cmpKey(rule.until, to) < 0 ? rule.until : to;
  if (cmpKey(limit, startDate) < 0) return out;
  const maxCount = rule.count != null && !isNaN(rule.count) ? Math.max(0, rule.count) : Infinity;
  const start = fromKey(startDate);
  const iv = rule.interval;
  let produced = 0;
  let steps = 0;

  if (rule.freq === "DAILY") {
    // First occurrence at or after `from` (or startDate), counting how many came before it.
    let n = 0;
    if (cmpKey(from, startDate) > 0) n = Math.ceil(diffDays(startDate, from) / iv);
    if (n >= maxCount) return out;
    produced = n;
    let cur = addDays(startDate, n * iv);
    while (cmpKey(cur, limit) <= 0 && produced < maxCount && steps++ < MAX_STEPS && out.length < MAX_INSTANCES) {
      out.push(cur);
      produced++;
      cur = addDays(cur, iv);
    }
  } else if (rule.freq === "WEEKLY") {
    const days = [...(rule.byDay && rule.byDay.length ? rule.byDay : [start.getDay()])].sort((a, b) => a - b);
    const firstWeek = addDays(startDate, -start.getDay());
    // Count occurrences in whole weeks before the week containing `from`, then walk from there.
    let weekIndex = 0;
    if (cmpKey(from, firstWeek) > 0) weekIndex = Math.max(0, Math.floor(diffDays(firstWeek, from) / (7 * iv)) - 1);
    if (maxCount !== Infinity) {
      // With COUNT we must count from the beginning; cap the walk instead.
      weekIndex = 0;
    }
    let weekStart = addDays(firstWeek, weekIndex * 7 * iv);
    while (cmpKey(weekStart, limit) <= 0 && produced < maxCount && steps++ < MAX_STEPS && out.length < MAX_INSTANCES) {
      for (const dow of days) {
        const day = addDays(weekStart, dow);
        if (cmpKey(day, startDate) < 0) continue;
        if (cmpKey(day, limit) > 0 || produced >= maxCount) break;
        if (cmpKey(day, from) >= 0) out.push(day);
        produced++;
      }
      weekStart = addDays(weekStart, 7 * iv);
    }
  } else if (rule.freq === "MONTHLY") {
    const mdays = [...(rule.byMonthDay && rule.byMonthDay.length ? rule.byMonthDay : [start.getDate()])].sort((a, b) => a - b);
    let y = start.getFullYear();
    let m = start.getMonth();
    if (maxCount === Infinity && cmpKey(from, startDate) > 0) {
      const f = keyParts(from);
      const monthsBetween = (f.y - y) * 12 + (f.m - 1 - m);
      const skip = Math.max(0, Math.floor(monthsBetween / iv) - 1) * iv;
      m += skip;
      y += Math.floor(m / 12);
      m = m % 12;
    }
    while (produced < maxCount && steps++ < MAX_STEPS && out.length < MAX_INSTANCES) {
      const firstOfMonth = `${String(y).padStart(4, "0")}-${pad(m + 1)}-01`;
      if (cmpKey(firstOfMonth, limit) > 0 || y > MAX_YEAR) break;
      const dim = daysInMonth(y, m);
      for (const md of mdays) {
        const d = md < 0 ? dim + md + 1 : md;
        if (d < 1 || d > dim) continue;
        const key = `${String(y).padStart(4, "0")}-${pad(m + 1)}-${pad(d)}`;
        if (cmpKey(key, startDate) < 0) continue;
        if (cmpKey(key, limit) > 0 || produced >= maxCount) break;
        if (cmpKey(key, from) >= 0) out.push(key);
        produced++;
      }
      m += iv;
      y += Math.floor(m / 12);
      m = m % 12;
    }
  } else if (rule.freq === "YEARLY") {
    let y = start.getFullYear();
    const m = start.getMonth();
    const d = start.getDate();
    if (maxCount === Infinity && cmpKey(from, startDate) > 0) {
      const f = keyParts(from);
      y += Math.max(0, Math.floor((f.y - y) / iv) - 1) * iv;
    }
    while (produced < maxCount && steps++ < MAX_STEPS && out.length < MAX_INSTANCES) {
      if (y > MAX_YEAR) break;
      const dim = daysInMonth(y, m);
      const key = `${String(y).padStart(4, "0")}-${pad(m + 1)}-${pad(Math.min(d, dim))}`;
      if (cmpKey(key, limit) > 0) break;
      if (cmpKey(key, from) >= 0) out.push(key);
      produced++;
      y += iv;
    }
  }
  return out;
}

// ---------- expansion ----------

export function expandEvents(raws: RawEvent[], from: string, to: string): EventInstance[] {
  const out: EventInstance[] = [];
  if (!isValidKey(from) || !isValidKey(to) || cmpKey(from, to) > 0) return out;
  for (const raw of raws) {
    if (raw.type === "single") {
      if (!raw.date) continue; // undated reminder: lives in its list, not on the calendar
      const date = raw.date;
      const endDate = raw.endDate && cmpKey(raw.endDate, date) > 0 ? raw.endDate : date;
      if (cmpKey(endDate, from) < 0 || cmpKey(date, to) > 0) continue;
      out.push(makeInstance(raw, date, endDate));
    } else if (raw.type === "recurring") {
      const startBound = raw.startRecur && cmpKey(raw.startRecur, from) > 0 ? raw.startRecur : from;
      const endBound = raw.endRecur && cmpKey(raw.endRecur, to) < 0 ? raw.endRecur : to;
      const set = new Set(raw.daysOfWeek);
      const skip = new Set(raw.skipDates ?? []);
      let guard = 0;
      for (let k = startBound; cmpKey(k, endBound) <= 0 && guard++ < 1200; k = addDays(k, 1)) {
        if (set.has(dayOfWeek(k)) && !skip.has(k)) out.push(makeInstance(raw, k, k));
      }
    } else if (raw.type === "rrule") {
      const rule = parseRRule(raw.rrule!);
      if (!rule) continue;
      const skip = new Set(raw.skipDates ?? []);
      for (const k of expandRRule(raw.startDate!, rule, from, to)) {
        if (!skip.has(k)) out.push(makeInstance(raw, k, k));
      }
    }
  }
  out.sort(compareInstances);
  return out;
}

function makeInstance(raw: RawEvent, date: string, endDate: string): EventInstance {
  const multiDay = endDate !== date;
  const allDay = raw.allDay || multiDay;
  const start = allDay ? 0 : Math.min(raw.startTime!, 23 * 60 + 59);
  let end = allDay ? 24 * 60 : raw.endTime ?? start + 60;
  if (!allDay && end <= start) end = Math.min(start + 30, 24 * 60);
  return { raw, title: raw.title, calendar: raw.calendar, date, endDate, allDay, start, end, multiDay };
}

export function compareInstances(a: EventInstance, b: EventInstance): number {
  if (a.date !== b.date) return cmpKey(a.date, b.date);
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return b.end - a.end; // longer first
  return a.title.localeCompare(b.title);
}

// Instances that touch a given day (multi-day bars included).
export function instancesOnDay(instances: EventInstance[], key: string): EventInstance[] {
  return instances.filter((i) => cmpKey(i.date, key) <= 0 && cmpKey(i.endDate, key) >= 0);
}

// ---------- overlap layout (Apple-style side-by-side columns) ----------

export interface Positioned<T> {
  item: T;
  col: number;
  cols: number;
}

// Items must have start/end minutes. Groups overlapping items into clusters and assigns columns.
export function layoutOverlaps<T extends { start: number; end: number }>(items: T[]): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const cols = colEnds.length;
    for (const p of cluster) p.cols = cols;
    result.push(...cluster);
    cluster = [];
    colEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= item.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(item.end);
    } else {
      colEnds[col] = item.end;
    }
    cluster.push({ item, col, cols: 0 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return result;
}

// Apple-ish calendar palette, assigned to calendars in folder order.
export const PALETTE = ["#FF3B30", "#007AFF", "#34C759", "#FF9500", "#AF52DE", "#FF2D55", "#5AC8FA", "#FFCC00", "#A2845E"];

// Local Date of an instance's start (all-day events count from 09:00, like Apple's all-day alerts).
export function instanceStart(inst: EventInstance): Date {
  const d = fromKey(inst.date);
  const min = inst.allDay ? 9 * 60 : inst.start;
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d;
}
