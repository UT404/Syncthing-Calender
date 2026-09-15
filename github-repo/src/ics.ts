// iCalendar (.ics, RFC 5545) export and import. Pure functions, no I/O, no network.
// Times are written as "floating" local times (no time zone), which every calendar app
// imports as the same wall-clock time. Nothing identifying (paths, device, user) is written.
import {
  RawEvent,
  WEEKDAY_LETTERS,
  addDays,
  cmpKey,
  dayOfWeek,
  isValidKey,
  minutesToHHMM,
  pad,
  parseRRule,
} from "./model";

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// ---------- export ----------

export interface ExportItem {
  raw: RawEvent;
  notes?: string; // note body, used as DESCRIPTION
}

export const MAX_EXPORT_DESC_CHARS = 2_000_000;

export function toICS(items: ExportItem[], calendarName: string, now = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Syncthing Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];
  const stamp = utcStamp(now);
  let budget = MAX_EXPORT_DESC_CHARS; // keeps huge vaults from producing a giant, slow export
  for (const { raw, notes } of items) {
    const desc = (notes ?? "").trim().slice(0, Math.min(20000, budget));
    budget -= desc.length;
    const ev = eventLines(raw, desc, stamp);
    if (ev) lines.push(...ev);
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function eventLines(raw: RawEvent, notes: string | undefined, stamp: string): string[] | null {
  const out = ["BEGIN:VEVENT", `UID:${uidFor(raw)}`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(raw.title)}`];
  let firstDay: string | null = null;
  let rule: string | null = null;
  let exdates: string[] = [];

  if (raw.type === "single") {
    firstDay = raw.date!;
  } else if (raw.type === "recurring") {
    // Full Calendar weekly format: start on the first matching weekday on/after startRecur.
    const from = raw.startRecur ?? "2000-01-02";
    let d = from;
    for (let i = 0; i < 7 && !raw.daysOfWeek!.includes(dayOfWeek(d)); i++) d = addDays(d, 1);
    firstDay = d;
    rule = `FREQ=WEEKLY;BYDAY=${raw.daysOfWeek!.map((n) => BYDAY[n]).join(",")}`;
    if (raw.endRecur) rule += `;UNTIL=${untilValue(raw.endRecur, raw.allDay)}`;
    exdates = raw.skipDates ?? [];
  } else {
    firstDay = raw.startDate!;
    const r = parseRRule(raw.rrule!);
    if (!r) return null;
    // Keep only the parts we understand, so what other apps show matches what this calendar shows.
    rule = `FREQ=${r.freq}`;
    if (r.interval > 1) rule += `;INTERVAL=${r.interval}`;
    if (r.byDay && r.byDay.length) rule += `;BYDAY=${r.byDay.map((n) => BYDAY[n]).join(",")}`;
    if (r.byMonthDay && r.byMonthDay.length) rule += `;BYMONTHDAY=${r.byMonthDay.join(",")}`;
    if (r.count != null && !isNaN(r.count)) rule += `;COUNT=${r.count}`;
    else if (r.until) rule += `;UNTIL=${untilValue(r.until, raw.allDay)}`;
    exdates = raw.skipDates ?? [];
  }
  if (!firstDay || !isValidKey(firstDay)) return null;

  const multiEnd = raw.type === "single" && raw.endDate && cmpKey(raw.endDate, firstDay) > 0 ? raw.endDate : null;
  if (raw.allDay) {
    out.push(`DTSTART;VALUE=DATE:${compact(firstDay)}`);
    out.push(`DTEND;VALUE=DATE:${compact(addDays(multiEnd ?? firstDay, 1))}`); // DTEND is exclusive
    for (const x of exdates) out.push(`EXDATE;VALUE=DATE:${compact(x)}`);
  } else {
    const start = raw.startTime!;
    const end = raw.endTime != null && raw.endTime > start ? raw.endTime : start + 60;
    out.push(`DTSTART:${compact(firstDay)}T${hhmm(start)}00`);
    out.push(`DTEND:${endStamp(multiEnd ?? firstDay, end)}`);
    for (const x of exdates) out.push(`EXDATE:${compact(x)}T${hhmm(start)}00`);
  }
  if (rule) out.push(`RRULE:${rule}`);
  if (raw.location) out.push(`LOCATION:${esc(raw.location)}`);
  if (raw.url && /^https?:\/\/\S{1,500}$/i.test(raw.url)) out.push(`URL:${raw.url}`);
  if (notes) out.push(`DESCRIPTION:${esc(notes)}`);
  for (const a of raw.alerts ?? []) {
    out.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(raw.title)}`, `TRIGGER:${a === 0 ? "PT0M" : `-PT${a}M`}`, "END:VALARM");
  }
  out.push("END:VEVENT");
  return out;
}

// Stable id per note (a 64-bit hash of its vault path) so re-importing into another app updates
// instead of duplicating. It changes if the note is renamed.
function uidFor(raw: RawEvent): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < raw.path.length; i++) {
    const c = raw.path.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}@orchard.local`;
}

function compact(key: string): string { return key.replace(/-/g, ""); }
function hhmm(min: number): string { return minutesToHHMM(Math.min(min, 1439)).replace(":", ""); }
function endStamp(day: string, min: number): string {
  if (min >= 1440) return `${compact(addDays(day, 1))}T000000`;
  return `${compact(day)}T${hhmm(min)}00`;
}
function untilValue(key: string, allDay: boolean): string { return allDay ? compact(key) : `${compact(key)}T235959`; }
function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// RFC 5545 text escaping.
function esc(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n"); // a lone CR must not start a new property line
}

// Fold lines longer than 75 octets (UTF-8 aware) with CRLF + space.
function utf8Len(cp: number): number { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
function fold(line: string): string {
  if (line.length <= 18) return line; // 18 chars × 4 bytes ≤ 75
  const parts: string[] = [];
  let start = 0, bytes = 0, limit = 75;
  for (let i = 0; i < line.length; ) {
    const cp = line.codePointAt(i)!;
    const w = cp > 0xffff ? 2 : 1;
    const n = utf8Len(cp);
    if (bytes + n > limit) { parts.push(line.slice(start, i)); start = i; bytes = 0; limit = 74; }
    bytes += n; i += w;
  }
  parts.push(line.slice(start));
  return parts.join("\r\n ");
}

// ---------- import ----------

export interface ImportedEvent {
  title: string;
  date: string;
  endDate: string | null;
  allDay: boolean;
  startTime: number | null;
  endTime: number | null;
  rrule: string | null; // "RRULE:..." in the supported subset
  skipDates: string[];
  location?: string;
  url?: string;
  notes?: string;
  alerts: number[];
}

export interface ImportResult { events: ImportedEvent[]; skipped: number; }

export const MAX_ICS_BYTES = 5 * 1024 * 1024;
export const MAX_ICS_EVENTS = 5000;
export const MAX_SKIP_DATES = 1000;

export function parseICS(text: string): ImportResult {
  if (text.length > MAX_ICS_BYTES) throw new Error("File is larger than 5 MB.");
  const lines = unfold(text);
  const events: ImportedEvent[] = [];
  let skipped = 0;
  let cur: Record<string, { params: Record<string, string>; value: string }[]> | null = null;
  let inAlarm = false;
  let alarmTriggers: string[] = [];
  let depth = 0;

  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN") {
      if (p.value === "VEVENT" && !cur) { cur = {}; alarmTriggers = []; depth = 0; inAlarm = false; }
      else if (cur && p.value === "VALARM") inAlarm = true;
      else if (cur) depth++;
      continue;
    }
    if (p.name === "END") {
      if (cur && depth > 0) { depth--; continue; } // closes a nested component, not our event
      if (p.value === "VEVENT" && cur) {
        if (events.length >= MAX_ICS_EVENTS) { skipped++; cur = null; continue; }
        const ev = buildEvent(cur, alarmTriggers);
        if (ev) events.push(ev); else skipped++;
        cur = null;
      } else if (cur && p.value === "VALARM") inAlarm = false;
      continue;
    }
    if (!cur || depth > 0) continue;
    if (inAlarm) { if (p.name === "TRIGGER" && alarmTriggers.length < 20) alarmTriggers.push(p.value); continue; }
    (cur[p.name] ??= []).push({ params: p.params, value: p.value });
  }
  return { events, skipped };
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out;
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  if (line.length > 100000) return null;
  // Name and params end at the first ":" that is not inside a quoted param value.
  let i = 0, inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ":" && !inQ) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i), value = line.slice(i + 1);
  const segs = head.split(";");
  const name = segs[0].toUpperCase().trim();
  if (!/^[A-Z0-9-]{1,40}$/.test(name)) return null;
  const params: Record<string, string> = Object.create(null);
  for (const s of segs.slice(1, 20)) {
    const eq = s.indexOf("=");
    if (eq > 0) params[s.slice(0, eq).toUpperCase()] = s.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, params, value };
}

type Props = Record<string, { params: Record<string, string>; value: string }[]>;

function buildEvent(p: Props, triggers: string[]): ImportedEvent | null {
  const ds = p.DTSTART?.[0];
  if (!ds) return null;
  const start = parseDateTime(ds.value, ds.params);
  if (!start) return null;
  let end: { date: string; min: number | null } | null = null;
  const de = p.DTEND?.[0];
  if (de) end = parseDateTime(de.value, de.params);
  else if (p.DURATION?.[0]) end = addDuration(start, p.DURATION[0].value);

  const allDay = start.min == null;
  const ev: ImportedEvent = {
    title: unesc(p.SUMMARY?.[0]?.value ?? "").slice(0, 300) || "Untitled event",
    date: start.date,
    endDate: null,
    allDay,
    startTime: start.min,
    endTime: null,
    rrule: null,
    skipDates: [],
    alerts: [...new Set(triggers.map(parseTrigger).filter((n): n is number => n != null))].sort((a, b) => b - a).slice(0, 4),
  };
  if (allDay) {
    // DTEND is exclusive for all-day events.
    if (end && end.min == null) {
      const last = addDays(end.date, -1);
      if (cmpKey(last, start.date) > 0) ev.endDate = last;
    }
  } else if (end) {
    if (end.date === start.date) ev.endTime = end.min;
    else if (cmpKey(end.date, start.date) > 0) {
      // Ends on a later day: if it ends exactly at midnight it is a same-day event until 23:59.
      if (end.min === 0 && addDays(start.date, 1) === end.date) ev.endTime = 1439;
      else { ev.endDate = end.date; ev.endTime = end.min; }
    }
  }
  const rr = p.RRULE?.[0]?.value;
  if (rr) {
    const rule = parseRRule("RRULE:" + rr);
    // A repeat we cannot represent faithfully would be shown on the wrong days: skip the event.
    if (!rule || /(^|;)(BYSETPOS|BYMONTH|BYYEARDAY|BYWEEKNO|BYHOUR|BYMINUTE|BYSECOND)=/i.test(rr) || /BYDAY=[^;]*[+-]?\d/i.test(rr)) return null;
    ev.rrule = "RRULE:" + rr.split(";").filter((part) => /^(FREQ|INTERVAL|COUNT|UNTIL|BYDAY|BYMONTHDAY)=/i.test(part)).join(";");
    ev.endDate = null;
    exdates: for (const x of p.EXDATE ?? []) {
      for (const v of x.value.split(",", 1000)) {
        if (ev.skipDates.length >= MAX_SKIP_DATES) break exdates;
        const d = parseDateTime(v, x.params);
        if (d) ev.skipDates.push(d.date);
      }
    }
  }
  const loc = p.LOCATION?.[0]?.value;
  if (loc) ev.location = unesc(loc).slice(0, 300);
  const url = p.URL?.[0]?.value;
  if (url && /^https?:\/\/[^\s]{1,500}$/i.test(url.trim())) ev.url = url.trim();
  const desc = p.DESCRIPTION?.[0]?.value;
  if (desc) ev.notes = neutralizeMarkdown(unesc(desc).slice(0, 20000));
  return ev;
}

// Returns local date + minutes (null for DATE values). UTC ("Z") times are converted to local;
// TZID times are taken as wall-clock times.
function parseDateTime(v: string, params: Record<string, string>): { date: string; min: number | null } | null {
  const m = v.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4] || params.VALUE === "DATE") {
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidKey(key) ? { date: key, min: null } : null;
  }
  let y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
  if (h > 23 || mi > 59 || y < 1000) return null;
  if (m[7] === "Z") {
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
    y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate(); h = dt.getHours(); mi = dt.getMinutes();
  }
  const key = `${String(y).padStart(4, "0")}-${pad(mo)}-${pad(d)}`;
  return isValidKey(key) ? { date: key, min: h * 60 + mi } : null;
}

function addDuration(start: { date: string; min: number | null }, dur: string): { date: string; min: number | null } | null {
  const m = dur.match(/^P(?:(\d{1,4})W)?(?:(\d{1,4})D)?(?:T(?:(\d{1,4})H)?(?:(\d{1,4})M)?(?:\d{1,5}S)?)?$/);
  if (!m) return null;
  const days = (+(m[1] ?? 0)) * 7 + +(m[2] ?? 0);
  const mins = (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0);
  if (start.min == null) return { date: addDays(start.date, days), min: null };
  const total = start.min + mins;
  return { date: addDays(start.date, days + Math.floor(total / 1440)), min: total % 1440 };
}

function parseTrigger(t: string | null): number | null {
  if (!t) return null;
  const m = t.trim().match(/^([+-]?)P(?:(\d{1,3})W)?(?:(\d{1,3})D)?(?:T(?:(\d{1,3})H)?(?:(\d{1,4})M)?(?:\d{1,5}S)?)?$/);
  if (!m) return null; // absolute date-time triggers are not supported
  const min = (+(m[2] ?? 0)) * 10080 + (+(m[3] ?? 0)) * 1440 + (+(m[4] ?? 0)) * 60 + +(m[5] ?? 0);
  if (m[1] !== "-" && min !== 0) return null; // alerts after the start are not supported
  return min <= 40320 ? min : null;
}

function unesc(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c)).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

// Letter list for a Full Calendar "recurring" note from a simple weekly RRULE, or null.
export function weeklyLetters(rrule: string): string[] | null {
  const r = parseRRule(rrule);
  if (!r || r.freq !== "WEEKLY" || r.interval !== 1 || r.count != null || !r.byDay?.length) return null;
  return r.byDay.map((n) => WEEKDAY_LETTERS[n]);
}

// Imported descriptions come from outside (email, websites). Escape the Markdown that would make
// Obsidian load remote content or run code when the note is opened: image/embeds, raw HTML,
// code fences (dataviewjs etc.) and Templater tags. Text stays readable.
export function neutralizeMarkdown(s: string): string {
  return s
    .replace(/!\[/g, "!\\[")
    .replace(/</g, "\\<")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "$\\{");
}
