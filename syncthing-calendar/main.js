"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SyncthingCalendarPlugin,
  safeRoot: () => safeRoot,
  splitNote: () => splitNote
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/model.ts
function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function toKey(d) {
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromKey(key) {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(2e3, 0, 1);
  dt.setFullYear(y, m - 1, d);
  return dt;
}
function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
function addMonths(key, n) {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, dim));
  return toKey(d);
}
function daysInMonth(y, m0) {
  const dt = new Date(2e3, 0, 1);
  dt.setFullYear(y, m0 + 1, 0);
  return dt.getDate();
}
function dayOfWeek(key) {
  return fromKey(key).getDay();
}
function todayKey() {
  return toKey(/* @__PURE__ */ new Date());
}
function diffDays(a, b) {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 864e5);
}
function cmpKey(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function keyParts(key) {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}
function normalizeDate(v) {
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
function isValidKey(key) {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return y >= MIN_YEAR && y <= MAX_YEAR && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo - 1);
}
var MIN_YEAR = 1e3;
var MAX_YEAR = 9998;
function clampKey(key) {
  if (isValidKey(key)) return key;
  return todayKey();
}
function parseTime(v) {
  if (v == null) return null;
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
  if (h > 24 || min > 59 || h === 24 && min > 0) return null;
  return h * 60 + min;
}
function minutesToHHMM(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
function formatTime(min, hour12 = true) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  if (!hour12) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}
var WEEKDAY_LETTERS = ["U", "M", "T", "W", "R", "F", "S"];
var MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var DAY_SHORT = DAY_NAMES.map((d) => d.slice(0, 3));
function parseFrontmatter(fm, path, basename, calendar) {
  var _a, _b, _c, _d, _e;
  if (!fm) return null;
  const type = (_a = fm.type) != null ? _a : "single";
  const title = typeof fm.title === "string" && fm.title.length ? fm.title : titleFromBasename(basename, type);
  const allDay = fm.allDay === true;
  const startTime = allDay ? null : parseTime(fm.startTime);
  const endTime = allDay ? null : parseTime(fm.endTime);
  const base = {
    path,
    calendar,
    title,
    allDay: allDay || startTime === null,
    startTime,
    endTime,
    location: cleanText(fm.location, 300),
    url: httpUrl(fm.url),
    alerts: parseAlerts(fm.alert)
  };
  if (type === "single") {
    const date = (_b = normalizeDate(fm.date)) != null ? _b : dateFromBasename(basename);
    if (!date) return null;
    return {
      ...base,
      type: "single",
      date,
      endDate: normalizeDate(fm.endDate),
      completed: (_c = fm.completed) != null ? _c : null
    };
  }
  if (type === "recurring") {
    const dows = Array.isArray(fm.daysOfWeek) ? fm.daysOfWeek : [];
    const daysOfWeek = dows.map((d) => WEEKDAY_LETTERS.indexOf(String(d).trim().toUpperCase())).filter((n) => n >= 0);
    if (!daysOfWeek.length) return null;
    const skip = Array.isArray(fm.skipDates) ? fm.skipDates.slice(0, 5e3) : [];
    return {
      ...base,
      type: "recurring",
      daysOfWeek,
      startRecur: (_d = normalizeDate(fm.startRecur)) != null ? _d : void 0,
      endRecur: (_e = normalizeDate(fm.endRecur)) != null ? _e : void 0,
      skipDates: skip.map(normalizeDate).filter((x) => !!x)
    };
  }
  if (type === "rrule") {
    const startDate = normalizeDate(fm.startDate);
    if (!startDate || typeof fm.rrule !== "string") return null;
    const skip = Array.isArray(fm.skipDates) ? fm.skipDates.slice(0, 5e3) : [];
    return {
      ...base,
      type: "rrule",
      startDate,
      rrule: fm.rrule,
      skipDates: skip.map(normalizeDate).filter((x) => !!x)
    };
  }
  return null;
}
function cleanText(v, max) {
  if (typeof v !== "string") return void 0;
  const t = v.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim().slice(0, max);
  return t || void 0;
}
function httpUrl(v) {
  const t = cleanText(v, 500);
  return t && /^https?:\/\/\S+$/i.test(t) ? t : void 0;
}
var ALERT_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
var MAX_ALERTS = 4;
function parseAlertValue(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,5}$/.test(v.trim()) ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 40320 ? Math.round(n) : null;
}
function parseAlerts(v) {
  const list = Array.isArray(v) ? v.slice(0, 20) : v == null ? [] : [v];
  const out = [...new Set(list.map(parseAlertValue).filter((n) => n != null))];
  return out.sort((a, b) => b - a).slice(0, MAX_ALERTS);
}
function titleFromBasename(basename, type) {
  if (type === "single") return basename.replace(/^\d{4}-\d{2}-\d{2}\s*/, "");
  return basename.replace(/^\([^)]*\)\s*/, "");
}
function dateFromBasename(basename) {
  const m = basename.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
var BYDAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseRRule(text) {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.toUpperCase().startsWith("RRULE:") || l.toUpperCase().startsWith("FREQ="));
  if (!line) return null;
  const body = line.replace(/^RRULE:/i, "");
  const rule = { interval: 1 };
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
        rule.interval = Math.min(1e3, Math.max(1, parseInt(v, 10) || 1));
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
        rule.byDay = [...new Set(v.split(",", 7).map((d) => BYDAY_MAP[d.replace(/^[+-]?\d+/, "").toUpperCase()]).filter((n) => n !== void 0))];
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = [...new Set(v.split(",", 31).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n >= -31 && n <= 31 && n !== 0))];
        break;
    }
  }
  return rule.freq ? rule : null;
}
function describeRRule(text) {
  const r = parseRRule(text);
  if (!r) return "custom rule";
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[r.freq];
  return r.interval === 1 ? `every ${unit}` : `every ${r.interval} ${unit}s`;
}
var MAX_INSTANCES = 2e3;
var MAX_STEPS = 5e3;
function expandRRule(startDate, rule, from, to) {
  const out = [];
  if (cmpKey(startDate, to) > 0) return out;
  const limit = rule.until && cmpKey(rule.until, to) < 0 ? rule.until : to;
  if (cmpKey(limit, startDate) < 0) return out;
  const maxCount = rule.count != null && !isNaN(rule.count) ? Math.max(0, rule.count) : Infinity;
  const start = fromKey(startDate);
  const iv = rule.interval;
  let produced = 0;
  let steps = 0;
  if (rule.freq === "DAILY") {
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
    const days = [...rule.byDay && rule.byDay.length ? rule.byDay : [start.getDay()]].sort((a, b) => a - b);
    const firstWeek = addDays(startDate, -start.getDay());
    let weekIndex = 0;
    if (cmpKey(from, firstWeek) > 0) weekIndex = Math.max(0, Math.floor(diffDays(firstWeek, from) / (7 * iv)) - 1);
    if (maxCount !== Infinity) {
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
    const mdays = [...rule.byMonthDay && rule.byMonthDay.length ? rule.byMonthDay : [start.getDate()]].sort((a, b) => a - b);
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
function expandEvents(raws, from, to) {
  var _a, _b;
  const out = [];
  if (!isValidKey(from) || !isValidKey(to) || cmpKey(from, to) > 0) return out;
  for (const raw of raws) {
    if (raw.type === "single") {
      if (!raw.date) continue;
      const date = raw.date;
      const endDate = raw.endDate && cmpKey(raw.endDate, date) > 0 ? raw.endDate : date;
      if (cmpKey(endDate, from) < 0 || cmpKey(date, to) > 0) continue;
      out.push(makeInstance(raw, date, endDate));
    } else if (raw.type === "recurring") {
      const startBound = raw.startRecur && cmpKey(raw.startRecur, from) > 0 ? raw.startRecur : from;
      const endBound = raw.endRecur && cmpKey(raw.endRecur, to) < 0 ? raw.endRecur : to;
      const set = new Set(raw.daysOfWeek);
      const skip = new Set((_a = raw.skipDates) != null ? _a : []);
      let guard = 0;
      for (let k = startBound; cmpKey(k, endBound) <= 0 && guard++ < 1200; k = addDays(k, 1)) {
        if (set.has(dayOfWeek(k)) && !skip.has(k)) out.push(makeInstance(raw, k, k));
      }
    } else if (raw.type === "rrule") {
      const rule = parseRRule(raw.rrule);
      if (!rule) continue;
      const skip = new Set((_b = raw.skipDates) != null ? _b : []);
      for (const k of expandRRule(raw.startDate, rule, from, to)) {
        if (!skip.has(k)) out.push(makeInstance(raw, k, k));
      }
    }
  }
  out.sort(compareInstances);
  return out;
}
function makeInstance(raw, date, endDate) {
  var _a;
  const multiDay = endDate !== date;
  const allDay = raw.allDay || multiDay;
  const start = allDay ? 0 : Math.min(raw.startTime, 23 * 60 + 59);
  let end = allDay ? 24 * 60 : (_a = raw.endTime) != null ? _a : start + 60;
  if (!allDay && end <= start) end = Math.min(start + 30, 24 * 60);
  return { raw, title: raw.title, calendar: raw.calendar, date, endDate, allDay, start, end, multiDay };
}
function compareInstances(a, b) {
  if (a.date !== b.date) return cmpKey(a.date, b.date);
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return b.end - a.end;
  return a.title.localeCompare(b.title);
}
function instancesOnDay(instances, key) {
  return instances.filter((i) => cmpKey(i.date, key) <= 0 && cmpKey(i.endDate, key) >= 0);
}
function layoutOverlaps(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = [];
  let cluster = [];
  let colEnds = [];
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
var PALETTE = ["#FF3B30", "#007AFF", "#34C759", "#FF9500", "#AF52DE", "#FF2D55", "#5AC8FA", "#FFCC00", "#A2845E"];
function instanceStart(inst) {
  const d = fromKey(inst.date);
  const min = inst.allDay ? 9 * 60 : inst.start;
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d;
}

// src/reminders.ts
var REMINDER_REPEATS = ["none", "daily", "weekdays", "weekly", "biweekly", "monthly", "yearly"];
var PRIORITY_MARK = { none: "", low: "!", medium: "!!", high: "!!!" };
var REMINDER_BLOCK_MIN = 30;
function parseReminder(fm, path, basename, list) {
  if (!fm || fm.reminder !== true) return null;
  const title = typeof fm.title === "string" && fm.title.trim() ? fm.title.trim().slice(0, 500) : basename.replace(/^\d{4}-\d{2}-\d{2}\s*/, "") || "Untitled";
  const due = normalizeDate(fm.due);
  const dueTime = due ? parseTime(fm.dueTime) : null;
  const completed = typeof fm.completed === "string" && /^\d{4}-\d{2}-\d{2}/.test(fm.completed) ? fm.completed.slice(0, 16) : false;
  const priority = ["low", "medium", "high"].includes(fm.priority) ? fm.priority : "none";
  const repeat = REMINDER_REPEATS.includes(fm.repeat) && due ? fm.repeat : "none";
  const url = typeof fm.url === "string" && /^https?:\/\/\S{1,500}$/i.test(fm.url.trim()) ? fm.url.trim() : void 0;
  const start = dueTime != null ? Math.min(dueTime, 23 * 60 + 59) : null;
  return {
    path,
    calendar: list,
    title,
    kind: "reminder",
    type: "single",
    date: due != null ? due : void 0,
    endDate: null,
    allDay: start == null,
    startTime: start,
    endTime: start != null ? Math.min(start + REMINDER_BLOCK_MIN, 23 * 60 + 59) : null,
    completed,
    flagged: fm.flagged === true,
    priority,
    reminderRepeat: repeat,
    created: typeof fm.created === "string" ? fm.created.slice(0, 16) : void 0,
    url,
    // An open reminder with a date alerts at its time (date-only: 9:00), like Apple Reminders.
    alerts: due && !completed ? [0] : []
  };
}
function reminderFrontmatter(v, created) {
  var _a;
  const fm = { title: v.title.trim(), reminder: true };
  if (v.due) {
    fm.due = v.due;
    if (v.dueTime != null) fm.dueTime = `${pad(Math.floor(v.dueTime / 60))}:${pad(v.dueTime % 60)}`;
    if (v.repeat !== "none") fm.repeat = v.repeat;
  }
  fm.completed = false;
  if (v.flagged) fm.flagged = true;
  if (v.priority !== "none") fm.priority = v.priority;
  const url = ((_a = v.url) != null ? _a : "").trim();
  if (url) fm.url = url.slice(0, 500);
  fm.created = created;
  return fm;
}
var REMINDER_KEYS = ["title", "reminder", "due", "dueTime", "completed", "flagged", "priority", "repeat", "url", "created"];
function nowStamp(d = /* @__PURE__ */ new Date()) {
  return `${toKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nextDue(due, repeat) {
  switch (repeat) {
    case "daily":
      return addDays(due, 1);
    case "weekdays": {
      let d = addDays(due, 1);
      while (dayOfWeek(d) === 0 || dayOfWeek(d) === 6) d = addDays(d, 1);
      return d;
    }
    case "weekly":
      return addDays(due, 7);
    case "biweekly":
      return addDays(due, 14);
    case "monthly":
      return addMonths(due, 1);
    case "yearly":
      return addMonths(due, 12);
    default:
      return due;
  }
}
var REMINDER_RRULE = {
  daily: "RRULE:FREQ=DAILY",
  weekdays: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "RRULE:FREQ=WEEKLY",
  biweekly: "RRULE:FREQ=WEEKLY;INTERVAL=2",
  monthly: "RRULE:FREQ=MONTHLY",
  yearly: "RRULE:FREQ=YEARLY"
};
var SMART = [
  { id: "today", label: "Today", color: "#007AFF" },
  { id: "scheduled", label: "Scheduled", color: "#FF3B30" },
  { id: "all", label: "All", color: "#3A3A3C" },
  { id: "flagged", label: "Flagged", color: "#FF9500" },
  { id: "completed", label: "Completed", color: "#8E8E93" }
];
function isOverdue(r, now = /* @__PURE__ */ new Date()) {
  if (r.completed || !r.date) return false;
  const today = toKey(now);
  if (cmpKey(r.date, today) < 0) return true;
  if (r.date === today && r.startTime != null) return r.startTime < now.getHours() * 60 + now.getMinutes();
  return false;
}
function inSmartList(r, id, today = todayKey()) {
  const open = !r.completed;
  switch (id) {
    case "today":
      return open && !!r.date && cmpKey(r.date, today) <= 0;
    case "scheduled":
      return open && !!r.date;
    case "all":
      return open;
    case "flagged":
      return open && !!r.flagged;
    case "completed":
      return !!r.completed;
  }
}
function sortReminders(list) {
  return [...list].sort((a, b) => {
    var _a, _b, _c, _d, _e, _f;
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    if (a.completed && b.completed) return String(b.completed).localeCompare(String(a.completed));
    if (!!a.date !== !!b.date) return a.date ? -1 : 1;
    if (a.date && b.date && a.date !== b.date) return cmpKey(a.date, b.date);
    if (((_a = a.startTime) != null ? _a : -1) !== ((_b = b.startTime) != null ? _b : -1)) return ((_c = a.startTime) != null ? _c : -1) - ((_d = b.startTime) != null ? _d : -1);
    return ((_e = a.created) != null ? _e : "").localeCompare((_f = b.created) != null ? _f : "") || a.title.localeCompare(b.title);
  });
}
function dueLabel(r, fmtTime, today = todayKey()) {
  if (!r.date || !isValidKey(r.date)) return "";
  const d = r.date === today ? "Today" : r.date === addDays(today, 1) ? "Tomorrow" : r.date === addDays(today, -1) ? "Yesterday" : shortDate(r.date, today);
  return r.startTime != null ? `${d}, ${fmtTime(r.startTime)}` : d;
}
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function shortDate(key, today = todayKey()) {
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return `${DOW[dayOfWeek(key)]}, ${MON[m - 1]} ${d}${sameYear ? "" : ", " + y}`;
}

// src/reminders-ui.ts
var GLYPH = { today: "", scheduled: "\u25A6", all: "\u2630", flagged: "\u2691", completed: "\u2713" };
function renderReminders(body, ctx, st, compact2, redraw) {
  var _a;
  const lists = ctx.getLists();
  const all = ctx.getReminders();
  const today = todayKey();
  if (((_a = st.sel) == null ? void 0 : _a.startsWith("list:")) && !lists.some((l) => "list:" + l.name === st.sel)) st.sel = null;
  if (!st.sel && !compact2) st.sel = "smart:today";
  const page = body.createDiv({ cls: "orc-rem" });
  page.toggleClass("is-compact", compact2);
  const pick = (sel2) => {
    st.sel = sel2;
    redraw();
  };
  if (!compact2 || !st.sel) {
    const side = page.createDiv({ cls: "orc-rem-side" });
    const tiles = side.createDiv({ cls: "orc-rtiles" });
    for (const s of SMART) {
      const tile = tiles.createDiv({ cls: "orc-rtile" });
      tile.setAttribute("data-smart", s.id);
      tile.toggleClass("is-active", !compact2 && st.sel === "smart:" + s.id);
      tile.style.setProperty("--cal", s.color);
      const top = tile.createDiv({ cls: "orc-rtile-top" });
      top.createDiv({ cls: "orc-ricon", text: s.id === "today" ? String(keyParts(today).d) : GLYPH[s.id] });
      if (s.id !== "completed") top.createDiv({ cls: "orc-rtile-count", text: String(all.filter((r) => inSmartList(r, s.id, today)).length) });
      tile.createDiv({ cls: "orc-rtile-label", text: s.label });
      tile.addEventListener("click", () => pick("smart:" + s.id));
    }
    side.createDiv({ cls: "orc-rsection", text: "My Lists" });
    const box = side.createDiv({ cls: "orc-rlists" });
    if (!lists.length) box.createDiv({ cls: "orc-muted orc-rlists-empty", text: 'No lists yet. Your first reminder makes a "Reminders" list.' });
    for (const l of lists) {
      const row2 = box.createDiv({ cls: "orc-rlistrow" });
      row2.setAttribute("data-list", l.name);
      row2.toggleClass("is-active", !compact2 && st.sel === "list:" + l.name);
      row2.style.setProperty("--cal", l.color);
      row2.createDiv({ cls: "orc-ricon orc-ricon-sm", text: "\u2630" });
      row2.createDiv({ cls: "orc-rlistname", text: l.name });
      row2.createDiv({ cls: "orc-rlistcount", text: String(all.filter((r) => !r.completed && r.calendar.name === l.name).length) });
      const info = row2.createDiv({ cls: "orc-info", text: "\u24D8", attr: { "aria-label": `Edit ${l.name}` } });
      info.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.editList(l);
      });
      row2.addEventListener("click", () => pick("list:" + l.name));
    }
    const add = side.createDiv({ cls: "orc-radd-list" });
    add.createSpan({ cls: "orc-radd-plus", text: "+" });
    add.createSpan({ text: "Add List" });
    add.addEventListener("click", () => ctx.newList());
  }
  if (!st.sel) return;
  const sel = st.sel;
  const isList = sel.startsWith("list:");
  const listName = isList ? sel.slice(5) : null;
  const smart = isList ? null : sel.slice(6);
  const meta = isList ? lists.find((l) => l.name === listName) : SMART.find((s) => s.id === smart);
  const color = isList ? meta.color : meta.color;
  const label = isList ? meta.name : meta.label;
  const member = (r) => {
    if (listName != null) return r.calendar.name === listName;
    switch (smart) {
      case "today":
        return r.completed ? String(r.completed).startsWith(today) : !!r.date && cmpKey(r.date, today) <= 0;
      case "scheduled":
        return !!r.date;
      case "flagged":
        return !!r.flagged;
      default:
        return true;
    }
  };
  const mine = all.filter(member);
  const open = smart === "completed" ? [] : sortReminders(mine.filter((r) => !r.completed));
  const done = sortReminders(mine.filter((r) => !!r.completed));
  const showDone = smart === "completed" || !!st.showDone[sel];
  const main = page.createDiv({ cls: "orc-rem-main" });
  main.style.setProperty("--cal", color);
  if (compact2) {
    const back = main.createDiv({ cls: "orc-rback" });
    back.createSpan({ cls: "orc-chev", text: "\u2039" });
    back.createSpan({ text: "Lists" });
    back.addEventListener("click", () => {
      st.sel = null;
      redraw();
    });
  }
  const head = main.createDiv({ cls: "orc-rhead" });
  head.createDiv({ cls: "orc-rtitle", text: label });
  if (smart !== "completed") head.createDiv({ cls: "orc-rtitle-count", text: String(open.length) });
  if (smart !== "completed") {
    const plus = head.createDiv({ cls: "orc-rplus", text: "+", attr: { "aria-label": "New reminder", title: "New reminder" } });
    plus.addEventListener("click", () => ctx.newReminder({ list: listName != null ? listName : void 0, due: smart === "today" || smart === "scheduled" ? today : null, flagged: smart === "flagged" }));
  }
  if (done.length && smart !== "completed") {
    const bar = main.createDiv({ cls: "orc-rdonebar" });
    bar.createSpan({ text: `${done.length} Completed` });
    if (isList || smart === "all") {
      bar.createSpan({ text: " \u2022 " });
      bar.createSpan({ cls: "orc-rlink", text: "Clear" }).addEventListener("click", () => ctx.clearCompleted(listName));
    }
    bar.createSpan({ cls: "orc-rlink orc-rshow", text: showDone ? "Hide" : "Show" }).addEventListener("click", () => {
      st.showDone[sel] = !showDone;
      redraw();
    });
  }
  if (smart === "completed" && done.length) {
    const bar = main.createDiv({ cls: "orc-rdonebar" });
    bar.createSpan({ text: `${done.length} Completed \u2022 ` });
    bar.createSpan({ cls: "orc-rlink", text: "Clear" }).addEventListener("click", () => ctx.clearCompleted(null));
  }
  const scroller = main.createDiv({ cls: "orc-ritems" });
  const fmt = (m) => formatTime(m, ctx.hour12);
  const showListName = !isList && smart !== "all";
  const row = (parent, r) => {
    const el = parent.createDiv({ cls: "orc-rrow" });
    el.setAttribute("data-path", r.path);
    el.toggleClass("is-done", !!r.completed);
    el.style.setProperty("--cal", r.calendar.color);
    const check = el.createDiv({ cls: "orc-rcheck", attr: { role: "checkbox", "aria-checked": String(!!r.completed), "aria-label": r.completed ? "Mark as not done" : "Mark as done" } });
    check.toggleClass("is-done", !!r.completed);
    check.addEventListener("click", (e) => {
      e.stopPropagation();
      check.toggleClass("is-done", !r.completed);
      el.addClass("is-toggling");
      ctx.toggleReminder(r);
    });
    const txt = el.createDiv({ cls: "orc-rrow-body" });
    const t = txt.createDiv({ cls: "orc-rrow-title" });
    if (r.priority && r.priority !== "none") t.createSpan({ cls: "orc-rprio", text: PRIORITY_MARK[r.priority] + " " });
    t.createSpan({ text: r.title });
    const bits = [];
    if (showListName) bits.push([r.calendar.name, ""]);
    const due = dueLabel(r, fmt, today);
    if (due) bits.push([due, isOverdue(r) ? "is-overdue" : ""]);
    if (r.reminderRepeat && r.reminderRepeat !== "none") bits.push(["\u21BB", ""]);
    if (r.completed && !due) bits.push(["Completed " + shortDate(String(r.completed).slice(0, 10), today), ""]);
    if (bits.length) {
      const m = txt.createDiv({ cls: "orc-rrow-meta" });
      bits.forEach(([s, cls], i) => {
        if (i) m.createSpan({ text: "  " });
        m.createSpan({ cls, text: s });
      });
    }
    if (r.url) txt.createDiv({ cls: "orc-rrow-url", text: r.url });
    if (r.flagged) el.createDiv({ cls: "orc-rflag", text: "\u2691" });
    el.addEventListener("click", () => ctx.openReminder(r));
  };
  const addRow = (parent, list, due, flagged) => {
    const el = parent.createDiv({ cls: "orc-rrow orc-radd" });
    el.createDiv({ cls: "orc-rcheck is-placeholder" });
    const input = el.createEl("input", { cls: "orc-radd-input", attr: { type: "text", placeholder: "New Reminder", maxlength: "500", "aria-label": "New reminder" } });
    let busy = false;
    const commit = async (keep) => {
      const v = input.value.trim();
      if (!v || busy) return;
      busy = true;
      st.refocus = keep;
      input.value = "";
      try {
        await ctx.quickAddReminder(v, list, due, flagged);
      } finally {
        busy = false;
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit(true);
      } else if (e.key === "Escape") {
        input.value = "";
        input.blur();
      }
      e.stopPropagation();
    });
    input.addEventListener("blur", () => void commit(false));
    if (st.refocus) {
      st.refocus = false;
      window.setTimeout(() => input.focus(), 0);
    }
  };
  const quickDue = smart === "today" || smart === "scheduled" ? today : null;
  if (smart === "scheduled") {
    const groups = /* @__PURE__ */ new Map();
    for (const r of open) {
      const k = cmpKey(r.date, today) < 0 ? "past" : r.date;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const [k, items] of groups) {
      const g = scroller.createDiv({ cls: "orc-rgroup" });
      const h = g.createDiv({ cls: "orc-rgroup-head", text: k === "past" ? "Past Due" : k === today ? "Today" : k === addDays(today, 1) ? "Tomorrow" : shortDate(k, today) });
      h.toggleClass("is-overdue", k === "past");
      items.forEach((r) => row(g, r));
    }
  } else if (smart === "all") {
    for (const l of lists) {
      const items = open.filter((r) => r.calendar.name === l.name);
      const g = scroller.createDiv({ cls: "orc-rgroup" });
      g.createDiv({ cls: "orc-rgroup-head", text: l.name }).style.color = l.color;
      items.forEach((r) => row(g, r));
      addRow(g, l.name, null, false);
    }
    if (!lists.length) addRow(scroller, null, null, false);
  } else {
    open.forEach((r) => row(scroller, r));
  }
  if (smart !== "all" && smart !== "completed") addRow(scroller, listName, quickDue, smart === "flagged");
  if (showDone) {
    const g = smart === "completed" ? scroller : scroller.createDiv({ cls: "orc-rgroup orc-rgroup-done" });
    done.forEach((r) => row(g, r));
  }
  if (!open.length && (!showDone || !done.length) && smart !== "all") {
    scroller.createDiv({ cls: "orc-rempty", text: smart === "completed" ? "No Completed Reminders" : "No Reminders" });
  }
}

// src/ui.ts
var MONTH_STYLES = [
  { id: "details", label: "Details", hint: "Event names in each day" },
  { id: "list", label: "List", hint: "Dots + the day's events below" }
];
var HOURS = 24;
var SNAP = 15;
var MAX_END = 23 * 60 + 59;
var TOUCH_HOLD_MS = 350;
var SVG_NS = "http://www.w3.org/2000/svg";
var CalendarUI = class {
  constructor(container, ctx) {
    this.container = container;
    this.ctx = ctx;
    this.styleMenu = null;
    this.segBtns = {};
    this.lastCalView = "month";
    this.rstate = { sel: null, showDone: {}, refocus: false };
    this.calPanelOpen = false;
    this.nowTimer = null;
    this.pending = false;
    this.dragging = false;
    this.suppressClickUntil = 0;
    this.active = null;
    this.cleanup = [];
    this.peek = null;
    this.peekDir = 0;
    this.pageAxis = null;
    this.pageOffset = 0;
    this.wheelTimer = null;
    this.wheelLockUntil = 0;
    this.paging = false;
    this.wheelHist = [];
    this.settling = false;
    this.wheelDone = null;
    this.root = container.createDiv({ cls: "orc" });
    this.root.tabIndex = 0;
    this.selected = ctx.state.cursor;
    this.buildChrome();
    this.root.addEventListener("click", (e) => {
      if (Date.now() < this.suppressClickUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    this.root.addEventListener("keydown", (e) => this.onKey(e));
    if (typeof ResizeObserver !== "undefined") {
      let lastW = 0, t = null;
      const ro = new ResizeObserver(() => {
        const w = this.root.clientWidth;
        if (Math.abs(w - lastW) < 8) return;
        lastW = w;
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => {
          if (this.state.view === "year" || this.state.view === "month" || this.state.view === "reminders") this.render();
        }, 120);
      });
      ro.observe(this.root);
      this.cleanup.push(() => ro.disconnect());
    }
    this.root.addEventListener("pointerdown", (e) => {
      if (!e.target.closest("input,textarea,select")) this.root.focus({ preventScroll: true });
    });
    this.render();
  }
  destroy() {
    if (this.nowTimer) window.clearInterval(this.nowTimer);
    this.cancelActive();
    for (const f of this.cleanup) f();
    this.root.remove();
  }
  get state() {
    return this.ctx.state;
  }
  goTo(date, view) {
    if (!isValidKey(date)) return;
    this.selected = date;
    if (view) this.state.view = view;
    else if (this.state.view === "reminders") this.state.view = this.lastCalView;
    this.setCursor(date);
  }
  // ---------- chrome ----------
  buildChrome() {
    const header = this.root.createDiv({ cls: "orc-header" });
    const nav = header.createDiv({ cls: "orc-nav" });
    const left = nav.createDiv({ cls: "orc-nav-left" });
    const addCal = left.createDiv({ cls: "orc-icon-btn orc-add-cal", attr: { "aria-label": "New calendar", title: "New calendar" } });
    icon(addCal, "calendar-plus");
    addCal.addEventListener("click", () => this.ctx.newCalendar());
    this.backBtn = left.createDiv({ cls: "orc-back" });
    this.backBtn.addEventListener("click", () => this.goUp());
    this.remBtn = left.createDiv({ cls: "orc-icon-btn orc-rem-btn", attr: { "aria-label": "Reminders", title: "Reminders (R)" } });
    icon(this.remBtn, "reminders");
    this.remBtn.addEventListener("click", () => this.setView(this.state.view === "reminders" ? this.lastCalView : "reminders"));
    const seg = nav.createDiv({ cls: "orc-seg" });
    ["year", "month", "week", "day"].forEach((v) => {
      const b = seg.createDiv({ cls: "orc-seg-btn", text: v[0].toUpperCase() + v.slice(1) });
      b.addEventListener("click", () => this.setView(v));
      this.segBtns[v] = b;
    });
    const right = nav.createDiv({ cls: "orc-nav-right" });
    const search = right.createDiv({ cls: "orc-icon-btn", attr: { "aria-label": "Search", title: "Search (/)" } });
    icon(search, "search");
    search.addEventListener("click", () => this.ctx.search());
    const add = right.createDiv({ cls: "orc-icon-btn orc-add", attr: { "aria-label": "New event", title: "New event (N)" } });
    icon(add, "plus");
    add.addEventListener("click", () => this.newItem());
    const titleRow = header.createDiv({ cls: "orc-title-row" });
    const prev = titleRow.createDiv({ cls: "orc-arrow", text: "\u2039" });
    prev.addEventListener("click", () => this.step(-1));
    this.titleEl = titleRow.createDiv({ cls: "orc-title" });
    this.styleBtn = titleRow.createDiv({ cls: "orc-style-btn", attr: { "aria-label": "Month layout", title: "Month layout" } });
    this.styleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleStyleMenu();
    });
    const next = titleRow.createDiv({ cls: "orc-arrow", text: "\u203A" });
    next.addEventListener("click", () => this.step(1));
    this.stage = this.root.createDiv({ cls: "orc-stage" });
    this.body = this.stage.createDiv({ cls: "orc-body" });
    this.attachPaging(this.stage);
    const footer = this.root.createDiv({ cls: "orc-footer" });
    footer.createDiv({ cls: "orc-foot-btn", text: "Today" }).addEventListener("click", () => this.goTo(todayKey()));
    footer.createDiv({ cls: "orc-foot-btn", text: "Calendars" }).addEventListener("click", () => this.toggleCalPanel());
    footer.createDiv({ cls: "orc-foot-spacer" });
    this.calPanel = this.root.createDiv({ cls: "orc-calpanel" });
    this.calPanel.style.display = "none";
  }
  toggleCalPanel(force) {
    this.calPanelOpen = force != null ? force : !this.calPanelOpen;
    this.calPanel.style.display = this.calPanelOpen ? "" : "none";
    if (this.calPanelOpen) this.renderCalPanel();
  }
  renderCalPanel() {
    this.calPanel.empty();
    const head = this.calPanel.createDiv({ cls: "orc-calpanel-head" });
    head.createSpan({ text: "Calendars" });
    head.createSpan({ cls: "orc-link", text: "Done" }).addEventListener("click", () => this.toggleCalPanel(false));
    const list = this.calPanel.createDiv({ cls: "orc-calpanel-list" });
    const cals = this.ctx.getCalendars();
    if (!cals.length) list.createDiv({ cls: "orc-empty", text: "No calendars yet." });
    for (const c of cals) {
      const row = list.createDiv({ cls: "orc-calrow" });
      const check = row.createDiv({ cls: "orc-calcheck" });
      check.style.setProperty("--cal", c.color);
      check.toggleClass("is-on", !this.ctx.isHidden(c.name));
      row.createSpan({ cls: "orc-calname", text: c.name });
      const info = row.createSpan({ cls: "orc-info", text: "\u24D8", attr: { "aria-label": `Edit ${c.name}` } });
      info.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCalPanel(false);
        this.ctx.editCalendar(c);
      });
      row.addEventListener("click", () => {
        this.ctx.setHidden(c.name, !this.ctx.isHidden(c.name));
        check.toggleClass("is-on", !this.ctx.isHidden(c.name));
        this.render();
      });
    }
    const newCal = list.createDiv({ cls: "orc-calrow orc-calrow-action" });
    newCal.createSpan({ cls: "orc-calname orc-link", text: "New calendar\u2026" });
    newCal.addEventListener("click", () => {
      this.toggleCalPanel(false);
      this.ctx.newCalendar();
    });
    const lists = this.ctx.getLists();
    list.createDiv({ cls: "orc-calpanel-sub", text: "Reminders" });
    {
      for (const l of lists) {
        const row = list.createDiv({ cls: "orc-calrow" });
        row.setAttribute("data-list", l.name);
        const check = row.createDiv({ cls: "orc-calcheck is-square" });
        check.style.setProperty("--cal", l.color);
        check.toggleClass("is-on", !this.ctx.isListHidden(l.name));
        row.createSpan({ cls: "orc-calname", text: l.name });
        const info = row.createSpan({ cls: "orc-info", text: "\u24D8", attr: { "aria-label": `Edit ${l.name}` } });
        info.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleCalPanel(false);
          this.ctx.editList(l);
        });
        row.addEventListener("click", () => {
          this.ctx.setListHidden(l.name, !this.ctx.isListHidden(l.name));
          check.toggleClass("is-on", !this.ctx.isListHidden(l.name));
          this.render();
        });
      }
    }
    const newList = list.createDiv({ cls: "orc-calrow orc-calrow-action" });
    newList.createSpan({ cls: "orc-calname orc-link", text: "New reminder list\u2026" });
    newList.addEventListener("click", () => {
      this.toggleCalPanel(false);
      this.ctx.newList();
    });
    list.createDiv({ cls: "orc-calpanel-sub", text: "Import / export" });
    const actions = [
      ["Import .ics\u2026", () => this.ctx.importICS()],
      ["Export .ics\u2026", () => this.ctx.exportICS()]
    ];
    for (const [label, fn] of actions) {
      const row = list.createDiv({ cls: "orc-calrow orc-calrow-action" });
      row.createSpan({ cls: "orc-calname orc-link", text: label });
      row.addEventListener("click", () => {
        this.toggleCalPanel(false);
        fn();
      });
    }
    list.createDiv({ cls: "orc-version orc-muted", text: `Syncthing Calendar v${this.ctx.version}` });
  }
  // ---------- navigation ----------
  setView(v) {
    if (v !== "reminders") this.lastCalView = v;
    this.state.view = v;
    this.commitState();
    this.render();
  }
  setCursor(key) {
    if (!isValidKey(key)) return;
    this.state.cursor = key;
    this.commitState();
    this.render();
  }
  commitState() {
    this.ctx.onStateChange(this.state);
  }
  goUp() {
    const v = this.state.view;
    if (v === "month") this.setView("year");
    else if (v === "week" || v === "day") this.setView("month");
  }
  step(n) {
    if (this.state.view === "reminders") return;
    const k = this.stepKey(n);
    if (this.state.view === "day") this.selected = k;
    this.setCursor(k);
  }
  // Desktop shortcuts while the calendar has focus (Apple-like, without stealing Obsidian's ⌘ keys).
  onKey(e) {
    const t = e.target;
    if (t.closest("input,textarea,select,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const map = {
      t: () => this.goTo(todayKey()),
      ArrowLeft: () => this.step(-1),
      ArrowRight: () => this.step(1),
      d: () => this.setView("day"),
      w: () => this.setView("week"),
      m: () => this.setView("month"),
      y: () => this.setView("year"),
      n: () => this.newItem(),
      r: () => this.setView(this.state.view === "reminders" ? this.lastCalView : "reminders"),
      "/": () => this.ctx.search(),
      Escape: () => {
        this.cancelActive();
        if (this.calPanelOpen) this.toggleCalPanel(false);
      }
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  }
  stepKey(n) {
    const c = this.state.cursor;
    const { y, m } = keyParts(c);
    switch (this.state.view) {
      case "year":
        return `${y + n}-${pad(m)}-01`;
      case "month":
        return addMonths(`${y}-${pad(m)}-01`, n);
      case "week":
        return addDays(c, 7 * n);
      default:
        return addDays(c, n);
    }
  }
  axesFor() {
    const v = this.state.view;
    if (v === "week" || v === "day") return ["x"];
    if (v === "month" || v === "year") return ["y", "x"];
    return [];
  }
  // Can the element under the pointer scroll itself this way? Then the scroll is left to it.
  nativeScroll(target, axis, delta) {
    for (let el = target; el && el !== this.stage; el = el.parentElement) {
      const st = getComputedStyle(el);
      if (axis === "y" && /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if (delta > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
      }
      if (axis === "x" && /(auto|scroll)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        if (delta > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true;
      }
    }
    return false;
  }
  pageSize() {
    return this.pageAxis === "y" ? this.stage.clientHeight : this.stage.clientWidth;
  }
  // Draw the neighbouring period into a second layer, reusing the normal renderers.
  makePeek(dir) {
    var _a;
    (_a = this.peek) == null ? void 0 : _a.remove();
    const el = this.stage.createDiv({ cls: "orc-body orc-peek" });
    const saved = { body: this.body, cursor: this.state.cursor, selected: this.selected, timer: this.nowTimer };
    this.body = el;
    this.state.cursor = this.stepKey(dir);
    try {
      this.renderView();
    } finally {
      if (this.nowTimer !== saved.timer && this.nowTimer) window.clearInterval(this.nowTimer);
      this.body = saved.body;
      this.state.cursor = saved.cursor;
      this.selected = saved.selected;
      this.nowTimer = saved.timer;
    }
    const cur = this.body.querySelector(".orc-timegrid"), nxt = el.querySelector(".orc-timegrid");
    if (cur && nxt) {
      const top = cur.scrollTop;
      nxt.scrollTop = top;
      window.requestAnimationFrame(() => {
        nxt.scrollTop = top;
      });
    }
    this.peek = el;
    this.peekDir = dir;
  }
  paintPage(animate) {
    const size = this.pageSize();
    const t = (off) => this.pageAxis === "y" ? `translateY(${off}px)` : `translateX(${off}px)`;
    for (const el of [this.body, this.peek]) if (el) el.style.transition = animate ? "transform .22s ease-out" : "none";
    this.body.style.transform = t(this.pageOffset);
    if (this.peek) this.peek.style.transform = t(this.pageOffset + this.peekDir * size);
  }
  beginPage(axis) {
    this.paging = true;
    this.pageAxis = axis;
    this.pageOffset = 0;
    this.root.addClass("is-paging");
  }
  movePage(offset) {
    const size = this.pageSize();
    this.pageOffset = Math.max(-size, Math.min(size, offset));
    const dir = this.pageOffset < 0 ? 1 : this.pageOffset > 0 ? -1 : 0;
    if (dir && dir !== this.peekDir) this.makePeek(dir);
    this.paintPage(false);
  }
  // On release: snap to whichever period covers more of the screen.
  endPage() {
    var _a, _b;
    if (!this.paging) return;
    const size = this.pageSize();
    const dir = this.peekDir;
    const grid = this.pageAxis === "y" ? (_b = (_a = this.body.querySelector(".orc-month")) == null ? void 0 : _a.clientHeight) != null ? _b : size : size;
    const go = dir !== 0 && !!this.peek && Math.abs(this.pageOffset) > Math.min(size, grid) / 2;
    this.pageOffset = go ? -dir * size : 0;
    this.paintPage(true);
    this.settling = true;
    window.setTimeout(() => {
      var _a2;
      this.paging = false;
      this.settling = false;
      this.root.removeClass("is-paging");
      this.body.style.transform = "";
      this.body.style.transition = "";
      (_a2 = this.peek) == null ? void 0 : _a2.remove();
      this.peek = null;
      this.peekDir = 0;
      this.pageAxis = null;
      if (go) this.step(dir);
      else if (this.pending) this.render();
    }, 230);
  }
  attachPaging(stage) {
    stage.addEventListener("wheel", (e) => {
      if (this.dragging || e.ctrlKey || this.calPanelOpen) return;
      if (this.settling) {
        if (this.pageAxis) e.preventDefault();
        return;
      }
      const axes = this.axesFor();
      if (!axes.length) return;
      if (Date.now() < this.wheelLockUntil) {
        if (this.pageAxis == null && !this.nativeScroll(e.target, Math.abs(e.deltaX) > Math.abs(e.deltaY) ? "x" : "y", Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)) {
          this.wheelLockUntil = Date.now() + 120;
          e.preventDefault();
        }
        return;
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.stage.clientHeight : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (!this.paging) {
        const axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (!axes.includes(axis) || this.nativeScroll(e.target, axis, axis === "x" ? dx : dy)) return;
        this.beginPage(axis);
      }
      e.preventDefault();
      this.movePage(this.pageOffset - (this.pageAxis === "y" ? dy : dx));
      const done = () => {
        if (this.wheelTimer) window.clearTimeout(this.wheelTimer);
        this.wheelTimer = null;
        this.wheelHist = [];
        this.wheelLockUntil = Date.now() + 250;
        this.endPage();
      };
      this.wheelDone = done;
      const step = Math.abs(this.pageAxis === "y" ? dy : dx);
      const h = this.wheelHist;
      h.push(step);
      if (h.length > 8) h.shift();
      const momentum = h.length >= 6 && h.slice(-6).every((v, i, a) => i === 0 || v < a[i - 1] && v <= a[i - 1] * 0.97);
      if (momentum) {
        done();
        return;
      }
      if (this.wheelTimer) window.clearTimeout(this.wheelTimer);
      this.wheelTimer = window.setTimeout(done, 4e3);
    }, { passive: false });
    stage.ownerDocument.addEventListener("mousemove", (e) => {
      if (this.wheelTimer != null && (e.movementX || e.movementY) && this.wheelDone) this.wheelDone();
    });
    let x0 = 0, y0 = 0, t0 = 0, decided = false, target = null;
    stage.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || this.paging) {
        decided = true;
        return;
      }
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      t0 = Date.now();
      decided = false;
      target = e.target;
    }, { passive: true });
    stage.addEventListener("touchmove", (e) => {
      if (this.dragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (!decided) {
        if (Math.hypot(dx, dy) < 12 || Date.now() - t0 > 900) return;
        decided = true;
        const axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (!this.axesFor().includes(axis) || this.nativeScroll(target, axis, axis === "x" ? -dx : -dy)) return;
        this.beginPage(axis);
      }
      if (!this.paging) return;
      e.preventDefault();
      const d = this.pageAxis === "x" ? dx : dy;
      this.movePage(d);
    }, { passive: false });
    const end = () => {
      if (this.paging && this.wheelTimer == null) this.endPage();
    };
    stage.addEventListener("touchend", end);
    stage.addEventListener("touchcancel", end);
  }
  // ---------- gestures ----------
  // One drag system for mouse, pen and touch. `start` decides what the press means and returns a
  // gesture, or null to ignore it (e.g. pressing on something else).
  attachGesture(el, start, opts = {}) {
    el.addEventListener("pointerdown", (e) => {
      var _a;
      if (e.pointerType === "touch" || e.button !== 0 || this.active) return;
      const win = (_a = el.ownerDocument.defaultView) != null ? _a : window;
      const target = e.target;
      const x0 = e.clientX, y0 = e.clientY;
      let g2 = null;
      const move = (ev) => {
        if (ev.buttons === 0) {
          up(ev);
          return;
        }
        if (g2 && this.active !== g2) {
          done();
          return;
        }
        if (!g2) {
          if (!el.isConnected) {
            done();
            return;
          }
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
          g2 = start(x0, y0, target, false);
          if (!g2) {
            done();
            return;
          }
          this.begin(g2);
        }
        ev.preventDefault();
        g2.move(ev.clientX, ev.clientY);
      };
      const up = (ev) => {
        if (g2 && this.active === g2) {
          g2.end(ev.clientX, ev.clientY);
          this.finish();
        }
        done();
      };
      const done = () => {
        win.removeEventListener("pointermove", move);
        win.removeEventListener("pointerup", up);
        win.removeEventListener("pointercancel", cancel);
      };
      const cancel = () => {
        if (g2 && this.active === g2) this.cancelActive();
        done();
      };
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", up);
      win.addEventListener("pointercancel", cancel);
    });
    let timer = null;
    let g = null;
    let sx = 0, sy = 0;
    const clearTimer = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || this.active) return;
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      const target = e.target;
      clearTimer();
      timer = window.setTimeout(() => {
        timer = null;
        if (!el.isConnected || this.active) return;
        g = start(sx, sy, target, true);
        if (g) {
          this.begin(g);
          g.move(sx, sy);
        }
      }, TOUCH_HOLD_MS);
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (g && this.active !== g) g = null;
      if (g) {
        e.preventDefault();
        g.move(t.clientX, t.clientY);
        return;
      }
      if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > 10) clearTimer();
    }, { passive: false });
    el.addEventListener("touchend", (e) => {
      clearTimer();
      if (g) {
        e.preventDefault();
        if (this.active === g) {
          const t = e.changedTouches[0];
          g.end(t.clientX, t.clientY);
          this.finish();
        }
        g = null;
      }
    });
    el.addEventListener("touchcancel", () => {
      clearTimer();
      if (g && this.active === g) this.cancelActive();
      g = null;
    });
    void opts;
  }
  begin(g) {
    this.active = g;
    this.dragging = true;
    this.root.addClass("is-dragging");
  }
  cancelActive() {
    const g = this.active;
    if (!g) return;
    g.cancel();
    this.finish();
  }
  finish() {
    this.active = null;
    this.dragging = false;
    this.suppressClickUntil = Date.now() + 400;
    this.root.removeClass("is-dragging");
    if (this.pending) window.setTimeout(() => this.renderIfPending(), 0);
  }
  // ---------- render ----------
  isVisible() {
    return this.root.isConnected && this.root.offsetParent !== null;
  }
  renderIfPending() {
    if (this.pending && this.isVisible()) this.render();
  }
  render() {
    if (!this.isVisible()) {
      this.pending = true;
      return;
    }
    if (this.dragging || this.paging) {
      this.pending = true;
      return;
    }
    this.pending = false;
    const v = this.state.view;
    for (const k of Object.keys(this.segBtns)) this.segBtns[k].toggleClass("is-active", k === v);
    this.remBtn.toggleClass("is-active", v === "reminders");
    if (v !== "reminders") this.lastCalView = v;
    this.root.setAttribute("data-view", v);
    this.root.toggleClass("is-narrow", this.isCompact());
    this.closeStyleMenu();
    const showStyle = v === "month" && this.isCompact();
    this.styleBtn.style.display = showStyle ? "" : "none";
    if (showStyle) this.styleBtn.setText(MONTH_STYLES.find((s) => s.id === this.ctx.monthStyle()).label + " \u25BE");
    this.renderBack();
    this.renderTitle();
    this.body.empty();
    if (this.nowTimer) {
      window.clearInterval(this.nowTimer);
      this.nowTimer = null;
    }
    if (v === "reminders") {
      renderReminders(this.body, this.ctx, this.rstate, this.isCompact(), () => this.render());
      if (this.calPanelOpen) this.renderCalPanel();
      return;
    }
    this.renderView();
    if (this.calPanelOpen) this.renderCalPanel();
  }
  // The calendar part of render(): also used to draw the neighbouring period while paging.
  renderView() {
    const v = this.state.view;
    if (!this.ctx.getCalendars().length) this.ctx.renderEmpty(this.body.createDiv({ cls: "orc-banner" }));
    const nConf = this.ctx.conflictCount();
    if (nConf > 0) {
      const b = this.body.createDiv({ cls: "orc-conflicts", text: `${nConf} sync conflict${nConf === 1 ? "" : "s"}: an event was changed on two devices before syncing. Tap to review.` });
      b.addEventListener("click", () => this.ctx.showConflicts());
    }
    if (v === "year") this.renderYear();
    else if (v === "month") this.renderMonth();
    else if (v === "week") this.renderWeek();
    else this.renderDay();
  }
  toggleStyleMenu() {
    if (this.styleMenu) {
      this.closeStyleMenu();
      return;
    }
    const menu = this.root.createDiv({ cls: "orc-style-menu" });
    const r = this.styleBtn.getBoundingClientRect(), R = this.root.getBoundingClientRect();
    menu.style.top = `${r.bottom - R.top + 4}px`;
    menu.style.right = `${Math.max(8, R.right - r.right)}px`;
    for (const s of MONTH_STYLES) {
      const row = menu.createDiv({ cls: "orc-style-item" });
      row.setAttribute("data-style", s.id);
      row.createSpan({ cls: "orc-style-tick", text: s.id === this.ctx.monthStyle() ? "\u2713" : "" });
      const t = row.createDiv();
      t.createDiv({ text: s.label });
      t.createDiv({ cls: "orc-muted", text: s.hint });
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        this.ctx.setMonthStyle(s.id);
        this.closeStyleMenu();
        this.render();
      });
    }
    this.styleMenu = menu;
    const off = () => this.closeStyleMenu();
    window.setTimeout(() => this.root.addEventListener("click", off, { once: true }), 0);
  }
  closeStyleMenu() {
    var _a;
    (_a = this.styleMenu) == null ? void 0 : _a.remove();
    this.styleMenu = null;
  }
  renderBack() {
    const { y, m } = keyParts(this.state.cursor);
    const v = this.state.view;
    this.backBtn.empty();
    if (v === "year" || v === "reminders") {
      this.backBtn.style.visibility = "hidden";
      return;
    }
    this.backBtn.style.visibility = "";
    this.backBtn.createSpan({ cls: "orc-chev", text: "\u2039" });
    this.backBtn.createSpan({ text: v === "month" ? String(y) : MONTH_SHORT[m - 1] });
  }
  renderTitle() {
    const { y, m } = keyParts(this.state.cursor);
    this.titleEl.empty();
    const v = this.state.view;
    if (v === "year") {
      this.titleEl.createSpan({ cls: "orc-title-accent", text: String(y) });
    } else if (v === "week") {
      const ws = this.weekStartOf(this.state.cursor);
      const we = addDays(ws, 6);
      const a = keyParts(ws), b = keyParts(we);
      const txt = a.m === b.m ? `${MONTH_SHORT[a.m - 1]} ${a.d} \u2013 ${b.d}` : `${MONTH_SHORT[a.m - 1]} ${a.d} \u2013 ${MONTH_SHORT[b.m - 1]} ${b.d}`;
      this.titleEl.createSpan({ cls: "orc-title-accent", text: txt });
      this.titleEl.createSpan({ text: " " + b.y });
    } else {
      this.titleEl.createSpan({ cls: "orc-title-accent", text: MONTH_NAMES[m - 1] });
      this.titleEl.createSpan({ text: " " + y });
    }
  }
  weekStartOf(key) {
    const offset = (dayOfWeek(key) - this.ctx.weekStart + 7) % 7;
    return addDays(key, -offset);
  }
  weekdayOrder() {
    return [0, 1, 2, 3, 4, 5, 6].map((i) => (i + this.ctx.weekStart) % 7);
  }
  isCompact() {
    return this.root.clientWidth > 0 && this.root.clientWidth < 520;
  }
  // ---------- year ----------
  renderYear() {
    const { y } = keyParts(this.state.cursor);
    const wrap = this.body.createDiv({ cls: "orc-year" });
    const avail = Math.max(260, (this.body.clientWidth || this.root.clientWidth || 390) - 40);
    const cols = avail >= 720 ? 4 : 3;
    const gap = avail >= 720 ? 36 : 14;
    const cell = Math.max(14, Math.min(34, Math.floor((avail - (cols - 1) * gap) / cols / 7)));
    wrap.style.setProperty("--cell", `${cell}px`);
    wrap.style.setProperty("--gap", `${gap}px`);
    wrap.style.gridTemplateColumns = `repeat(${cols}, ${cell * 7}px)`;
    const today = todayKey();
    const order = this.weekdayOrder();
    for (let m = 0; m < 12; m++) {
      const mini = wrap.createDiv({ cls: "orc-mini" });
      const first = `${y}-${pad(m + 1)}-01`;
      const isThisMonth = today.startsWith(`${y}-${pad(m + 1)}`);
      mini.createDiv({ cls: "orc-mini-name", text: MONTH_SHORT[m] }).toggleClass("is-current", isThisMonth);
      const grid = mini.createDiv({ cls: "orc-mini-grid" });
      for (const d of order) grid.createDiv({ cls: "orc-mini-dow", text: DAY_SHORT[d][0] });
      const lead = (dayOfWeek(first) - this.ctx.weekStart + 7) % 7;
      for (let i = 0; i < lead; i++) grid.createDiv({ cls: "orc-mini-day is-empty" });
      for (let d = 1; d <= daysInMonth(y, m); d++) {
        const key = `${y}-${pad(m + 1)}-${pad(d)}`;
        grid.createDiv({ cls: "orc-mini-day", text: String(d) }).toggleClass("is-today", key === today);
      }
      mini.addEventListener("click", () => {
        this.selected = isThisMonth ? today : first;
        this.state.view = "month";
        this.setCursor(first);
      });
    }
  }
  // ---------- month ----------
  renderMonth() {
    var _a;
    const { y, m } = keyParts(this.state.cursor);
    const today = todayKey();
    const compact2 = this.isCompact();
    const order = this.weekdayOrder();
    const dow = this.body.createDiv({ cls: "orc-dow" });
    for (const d of order) dow.createDiv({ cls: "orc-dow-cell", text: compact2 ? DAY_SHORT[d][0] : DAY_SHORT[d] });
    const first = `${y}-${pad(m)}-01`;
    const lead = (dayOfWeek(first) - this.ctx.weekStart + 7) % 7;
    const gridStart = addDays(first, -lead);
    const rows = Math.ceil((lead + daysInMonth(y, m - 1)) / 7);
    const gridEnd = addDays(gridStart, rows * 7 - 1);
    const instances = this.ctx.getInstances(gridStart, gridEnd);
    const style = compact2 ? this.ctx.monthStyle() : null;
    const scroll = style === "details" ? this.body.createDiv({ cls: "orc-month-scroll" }) : this.body;
    const grid = scroll.createDiv({ cls: "orc-month" });
    grid.style.gridTemplateRows = style === "details" ? `repeat(${rows}, minmax(96px, auto))` : `repeat(${rows}, minmax(0, 1fr))`;
    grid.toggleClass("is-compact", compact2);
    if (style) grid.addClass("is-" + style);
    if (!this.selected.startsWith(`${y}-${pad(m)}`)) this.selected = today.startsWith(`${y}-${pad(m)}`) ? today : first;
    const listWrap = style === "list" ? this.body.createDiv({ cls: "orc-daylist" }) : null;
    const useBars = !compact2 || style === "details";
    const laneH = style === "details" ? 14 : 17;
    grid.style.setProperty("--lh", `${laneH}px`);
    const rowLanes = [];
    if (useBars) {
      const spans = instances.filter((ev) => ev.multiDay);
      for (let r = 0; r < rows; r++) {
        const rs = addDays(gridStart, r * 7), re = addDays(rs, 6);
        const segs = spans.filter((ev) => cmpKey(ev.date, re) <= 0 && cmpKey(ev.endDate, rs) >= 0).sort((a, b) => cmpKey(a.date, b.date) || diffDays(b.date, b.endDate) - diffDays(a.date, a.endDate));
        const laneEnds = [];
        for (const ev of segs) {
          const s = cmpKey(ev.date, rs) < 0 ? rs : ev.date;
          const e = cmpKey(ev.endDate, re) > 0 ? re : ev.endDate;
          let lane = laneEnds.findIndex((end) => cmpKey(end, s) < 0);
          if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(e);
          } else laneEnds[lane] = e;
          const bar = this.renderChip(grid, ev, s);
          bar.addClass("orc-mbar");
          bar.toggleClass("is-cont-left", cmpKey(ev.date, rs) < 0);
          bar.toggleClass("is-cont-right", cmpKey(ev.endDate, re) > 0);
          bar.setAttribute("data-span", String(diffDays(s, e) + 1));
          bar.style.gridRow = String(r + 1);
          bar.style.gridColumn = `${diffDays(rs, s) + 1} / ${diffDays(rs, e) + 2}`;
          bar.style.setProperty("--lane", String(lane));
        }
        rowLanes.push(laneEnds.length);
      }
      window.requestAnimationFrame(() => {
        const dn = grid.querySelector(".orc-cell .orc-daynum");
        const cell0 = dn == null ? void 0 : dn.parentElement;
        if (dn && cell0) grid.style.setProperty("--dn", `${Math.round(dn.getBoundingClientRect().bottom - cell0.getBoundingClientRect().top) + 1}px`);
      });
    }
    for (let i = 0; i < rows * 7; i++) {
      const key = addDays(gridStart, i);
      const p = keyParts(key);
      const cell = grid.createDiv({ cls: "orc-cell" });
      cell.style.gridRow = String(Math.floor(i / 7) + 1);
      cell.style.gridColumn = String(i % 7 + 1);
      cell.setAttribute("data-key", key);
      cell.toggleClass("is-other", p.m !== m);
      cell.toggleClass("is-today", key === today);
      cell.toggleClass("is-selected", key === this.selected);
      cell.toggleClass("is-weekend", dayOfWeek(key) === 0 || dayOfWeek(key) === 6);
      cell.createDiv({ cls: "orc-daynum" }).createSpan({ text: p.d === 1 && !compact2 ? `${MONTH_SHORT[p.m - 1]} ${p.d}` : String(p.d) });
      const allOnDay = instancesOnDay(instances, key);
      const dayEvents = useBars ? allOnDay.filter((ev) => !ev.multiDay) : allOnDay;
      const lanes = useBars ? (_a = rowLanes[Math.floor(i / 7)]) != null ? _a : 0 : 0;
      if (lanes) cell.createDiv({ cls: "orc-mbar-space" }).style.height = `${lanes * laneH}px`;
      if (style === "details") {
        const list = cell.createDiv({ cls: "orc-cell-events" });
        dayEvents.slice(0, 12).forEach((ev) => this.renderChip(list, ev, key).addClass("is-detail"));
        if (dayEvents.length > 12) list.createDiv({ cls: "orc-more", text: `+${dayEvents.length - 12}` });
      } else if (compact2) {
        const dots = cell.createDiv({ cls: "orc-dots" });
        const seen = /* @__PURE__ */ new Set();
        for (const ev of dayEvents) {
          if (seen.has(ev.calendar.name) || seen.size >= 4) continue;
          seen.add(ev.calendar.name);
          dots.createDiv({ cls: "orc-dot" }).style.background = ev.calendar.color;
        }
      } else {
        const list = cell.createDiv({ cls: "orc-cell-events" });
        const MAX_CHIPS = 12;
        dayEvents.slice(0, MAX_CHIPS).forEach((ev) => this.renderChip(list, ev, key));
        const more = list.createDiv({ cls: "orc-more" });
        more.setAttribute("data-extra", String(Math.max(0, dayEvents.length - MAX_CHIPS)));
        more.style.display = "none";
      }
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".orc-chip")) return;
        if (compact2 && (this.selected === key || style !== "list")) {
          this.goTo(key, "day");
          return;
        }
        this.selected = key;
        grid.querySelectorAll(".orc-cell.is-selected").forEach((c) => c.classList.remove("is-selected"));
        cell.addClass("is-selected");
        if (listWrap) this.renderDayList(listWrap, instances);
      });
      cell.addEventListener("dblclick", (e) => {
        if (!e.target.closest(".orc-chip")) this.ctx.createEvent(key, null);
      });
    }
    this.attachGesture(grid, (x, y2, target, touch) => {
      const chip = target.closest(".orc-chip");
      if (chip) return this.chipDrag(chip, grid, x, y2);
      if (touch) {
        const cell = target.closest(".orc-cell");
        if (cell) this.ctx.createEvent(cell.getAttribute("data-key"), null);
        return { move() {
        }, end() {
        }, cancel() {
        } };
      }
      return null;
    });
    if (listWrap) this.attachGesture(listWrap, (x, y2, target) => {
      const row = target.closest(".orc-listrow");
      return row ? this.chipDrag(row, grid, x, y2) : null;
    });
    if (listWrap) this.renderDayList(listWrap, instances);
    else window.requestAnimationFrame(() => this.fitChips(grid));
  }
  chipDrag(chip, grid, x0, y0) {
    var _a;
    const inst = chip.__inst;
    let fromKey2 = chip.getAttribute("data-day");
    if (!inst || !fromKey2) return null;
    const rect = chip.getBoundingClientRect();
    const span = parseInt((_a = chip.getAttribute("data-span")) != null ? _a : "1", 10) || 1;
    if (span > 1) fromKey2 = addDays(fromKey2, Math.max(0, Math.min(span - 1, Math.floor((x0 - rect.left) / rect.width * span))));
    const fromList = chip.hasClass("orc-listrow");
    const ghost = chip.cloneNode(true);
    ghost.addClass("orc-drag-ghost");
    ghost.style.width = `${Math.min(rect.width, fromList ? 200 : 240)}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    chip.ownerDocument.body.appendChild(ghost);
    chip.addClass("is-lifted");
    let target = null;
    const pick = (x, y) => {
      var _a2;
      const el = chip.ownerDocument.elementFromPoint(x, y);
      const cell = (_a2 = el == null ? void 0 : el.closest(".orc-cell")) != null ? _a2 : null;
      if (cell !== target) {
        target == null ? void 0 : target.removeClass("is-drop-target");
        target = cell && grid.contains(cell) ? cell : null;
        target == null ? void 0 : target.addClass("is-drop-target");
      }
    };
    const clear = () => {
      ghost.remove();
      chip.removeClass("is-lifted");
      target == null ? void 0 : target.removeClass("is-drop-target");
    };
    return {
      move: (x, y) => {
        const lift = fromList ? rect.height + 12 : 0;
        ghost.style.transform = `translate(${x - x0}px, ${y - y0 - lift}px)`;
        pick(x, y);
      },
      end: (x, y) => {
        pick(x, y);
        const to = target == null ? void 0 : target.getAttribute("data-key");
        clear();
        if (to && to !== fromKey2) this.ctx.moveEvent(inst, { dayDelta: diffDays(fromKey2, to) });
      },
      cancel: clear
    };
  }
  // Hide chips that do not fit in a month cell and show "+N more".
  fitChips(grid) {
    grid.querySelectorAll(".orc-cell").forEach((cell) => {
      var _a;
      const list = cell.querySelector(".orc-cell-events");
      const more = cell.querySelector(".orc-more");
      if (!list || !more) return;
      const chips = Array.from(list.querySelectorAll(".orc-chip"));
      chips.forEach((c) => c.style.display = "");
      more.style.display = "none";
      const avail = list.clientHeight;
      if (avail <= 0) return;
      const extra = parseInt((_a = more.getAttribute("data-extra")) != null ? _a : "0", 10) || 0;
      let used = 0, hidden = extra;
      const moreH = 16;
      for (let i = 0; i < chips.length; i++) {
        const h = chips[i].offsetHeight + 2;
        const remainingAfter = chips.length - i - 1;
        const need = used + h + (remainingAfter > 0 ? moreH : 0);
        if (need > avail && !(remainingAfter === 0 && used + h <= avail)) {
          hidden = chips.length - i + extra;
          for (let j = i; j < chips.length; j++) chips[j].style.display = "none";
          break;
        }
        used += h;
      }
      if (hidden > 0) {
        more.setText(`+${hidden} more`);
        more.style.display = "";
        more.onclick = () => this.goTo(cell.getAttribute("data-key"), "day");
      }
    });
  }
  renderDayList(wrap, instances) {
    wrap.empty();
    const key = this.selected;
    const p = keyParts(key);
    wrap.createDiv({ cls: "orc-daylist-head" }).createSpan({ cls: key === todayKey() ? "orc-title-accent" : "", text: `${DAY_NAMES[dayOfWeek(key)]}, ${MONTH_NAMES[p.m - 1]} ${p.d}` });
    const events = instancesOnDay(instances, key);
    if (!events.length) {
      wrap.createDiv({ cls: "orc-empty", text: "No events" });
      return;
    }
    for (const ev of events) {
      const row = wrap.createDiv({ cls: "orc-listrow" });
      row.__inst = ev;
      row.setAttribute("data-day", key);
      const time = row.createDiv({ cls: "orc-listtime" });
      const isRem = ev.raw.kind === "reminder";
      if (ev.allDay) time.setText(isRem ? "" : "all-day");
      else {
        time.createDiv({ text: formatTime(ev.start, this.ctx.hour12) });
        if (!isRem) time.createDiv({ cls: "orc-muted", text: formatTime(ev.end, this.ctx.hour12) });
      }
      if (isRem) {
        row.addClass("is-reminder");
        row.style.setProperty("--cal", ev.calendar.color);
        this.reminderCheck(row, ev).addClass("orc-listcheck");
      } else row.createDiv({ cls: "orc-listbar" }).style.background = ev.calendar.color;
      const txt = row.createDiv({ cls: "orc-listtext" });
      txt.createDiv({ cls: "orc-listtitle", text: ev.title });
      txt.createDiv({ cls: "orc-muted", text: isRem ? `${ev.calendar.name} \xB7 Reminder` : ev.raw.location ? `${ev.calendar.name} \xB7 ${ev.raw.location}` : ev.calendar.name });
      row.addEventListener("click", () => this.ctx.openEvent(ev));
    }
  }
  renderChip(parent, ev, dayKey) {
    const chip = parent.createDiv({ cls: "orc-chip" });
    chip.__inst = ev;
    chip.setAttribute("data-day", dayKey);
    chip.style.setProperty("--cal", ev.calendar.color);
    chip.toggleClass("is-allday", ev.allDay);
    chip.toggleClass("is-cont-left", ev.multiDay && cmpKey(ev.date, dayKey) < 0);
    chip.toggleClass("is-cont-right", ev.multiDay && cmpKey(ev.endDate, dayKey) > 0);
    if (ev.raw.kind === "reminder") {
      chip.addClass("is-reminder");
      this.reminderCheck(chip, ev);
    }
    if (!ev.allDay) chip.createSpan({ cls: "orc-chip-time", text: formatTime(ev.start, this.ctx.hour12).replace(" ", "").toLowerCase() });
    chip.createSpan({ cls: "orc-chip-title", text: ev.title });
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      this.ctx.openEvent(ev);
    });
    return chip;
  }
  // The round check box on a reminder. Tapping it marks the reminder done (or not done) without
  // opening it, like Apple Calendar.
  reminderCheck(parent, ev) {
    const done = !!ev.raw.completed;
    parent.toggleClass("is-done", done);
    const c = parent.createSpan({ cls: "orc-rcheck is-mini", attr: { role: "checkbox", "aria-checked": String(done), "aria-label": done ? "Mark as not done" : "Mark as done" } });
    c.toggleClass("is-done", done);
    c.addEventListener("click", (e) => {
      e.stopPropagation();
      if (Date.now() < this.suppressClickUntil) return;
      c.toggleClass("is-done", !done);
      this.ctx.toggleReminder(ev.raw);
    });
    return c;
  }
  // "+" and N: a new event (the form has an Event/Reminder switch); on the Reminders page, a reminder.
  newItem() {
    var _a;
    if (this.state.view === "reminders") {
      const sel = (_a = this.rstate.sel) != null ? _a : "";
      this.ctx.newReminder({ list: sel.startsWith("list:") ? sel.slice(5) : void 0, due: sel === "smart:today" || sel === "smart:scheduled" ? todayKey() : null, flagged: sel === "smart:flagged" });
    } else this.ctx.createEvent(this.selected, null);
  }
  // ---------- week ----------
  renderWeek() {
    const ws = this.weekStartOf(this.state.cursor);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i));
    const instances = this.ctx.getInstances(days[0], days[6]);
    const compact2 = this.isCompact();
    const today = todayKey();
    const head = this.body.createDiv({ cls: "orc-week-head" });
    head.createDiv({ cls: "orc-gutter" });
    for (const key of days) {
      const h = head.createDiv({ cls: "orc-week-day" });
      h.toggleClass("is-today", key === today);
      h.toggleClass("is-weekend", dayOfWeek(key) === 0 || dayOfWeek(key) === 6);
      h.createDiv({ cls: "orc-week-dow", text: compact2 ? DAY_SHORT[dayOfWeek(key)][0] : DAY_SHORT[dayOfWeek(key)] });
      h.createDiv({ cls: "orc-week-num", text: String(keyParts(key).d) });
      h.addEventListener("click", () => this.goTo(key, "day"));
    }
    this.renderAllDayRow(days, instances);
    this.renderTimeGrid(days, instances);
  }
  renderAllDayRow(days, instances) {
    const allDay = instances.filter((i) => i.allDay);
    const row = this.body.createDiv({ cls: "orc-allday" });
    row.createDiv({ cls: "orc-gutter orc-gutter-label", text: "all-day" });
    const lanes = row.createDiv({ cls: "orc-allday-lanes" });
    lanes.style.gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;
    if (!allDay.length) row.addClass("is-empty");
    const laneEnds = [];
    const first = days[0], last = days[days.length - 1];
    const sorted = [...allDay].sort((a, b) => cmpKey(a.date, b.date) || diffDays(b.date, b.endDate) - diffDays(a.date, a.endDate));
    for (const ev of sorted) {
      const s = cmpKey(ev.date, first) < 0 ? first : ev.date;
      const e = cmpKey(ev.endDate, last) > 0 ? last : ev.endDate;
      let lane = laneEnds.findIndex((end) => cmpKey(end, s) < 0);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e);
      } else laneEnds[lane] = e;
      const bar = lanes.createDiv({ cls: "orc-bar" });
      bar.__inst = ev;
      bar.style.setProperty("--cal", ev.calendar.color);
      bar.style.gridColumn = `${diffDays(first, s) + 1} / ${diffDays(first, e) + 2}`;
      bar.style.gridRow = String(lane + 1);
      bar.toggleClass("is-cont-left", cmpKey(ev.date, first) < 0);
      bar.toggleClass("is-cont-right", cmpKey(ev.endDate, last) > 0);
      if (ev.raw.kind === "reminder") {
        bar.addClass("is-reminder");
        this.reminderCheck(bar, ev);
      }
      bar.createSpan({ text: ev.title });
      bar.addEventListener("click", () => this.ctx.openEvent(ev));
    }
    if (days.length > 1) this.attachGesture(lanes, (x, _y, target) => {
      const bar = target.closest(".orc-bar");
      const inst = bar && bar.__inst;
      if (!bar || !inst) return null;
      const colOf = (px) => {
        const r = lanes.getBoundingClientRect();
        return Math.max(0, Math.min(days.length - 1, Math.floor((px - r.left) / r.width * days.length)));
      };
      const grab = colOf(x);
      const orig = bar.style.gridColumn;
      const [c0, c1] = orig.split("/").map((v) => parseInt(v, 10));
      bar.addClass("is-dragging-bar");
      let delta = 0;
      return {
        move: (px) => {
          delta = colOf(px) - grab;
          const a = Math.max(1, c0 + delta), b = Math.min(days.length + 1, c1 + delta);
          bar.style.gridColumn = `${a} / ${Math.max(a + 1, b)}`;
        },
        end: () => {
          bar.removeClass("is-dragging-bar");
          if (delta !== 0) this.ctx.moveEvent(inst, { dayDelta: delta });
          else bar.style.gridColumn = orig;
        },
        cancel: () => {
          bar.removeClass("is-dragging-bar");
          bar.style.gridColumn = orig;
        }
      };
    });
  }
  renderTimeGrid(days, instances) {
    const H = this.ctx.hourHeight;
    const scroller = this.body.createDiv({ cls: "orc-timegrid" });
    const inner = scroller.createDiv({ cls: "orc-time-inner" });
    inner.style.height = `${HOURS * H}px`;
    inner.style.gridTemplateColumns = `var(--orc-gutter) repeat(${days.length}, minmax(0, 1fr))`;
    const gutter = inner.createDiv({ cls: "orc-gutter orc-time-gutter" });
    for (let h = 0; h < HOURS; h++) {
      const lbl = gutter.createDiv({ cls: "orc-hour-label", text: h === 0 ? "" : formatTime(h * 60, this.ctx.hour12).replace(":00", "") });
      lbl.style.top = `${h * H}px`;
    }
    const today = todayKey();
    const cols = [];
    for (const key of days) {
      const col = inner.createDiv({ cls: "orc-daycol" });
      col.setAttribute("data-key", key);
      cols.push({ key, el: col });
      col.toggleClass("is-today", key === today);
      col.toggleClass("is-weekend", dayOfWeek(key) === 0 || dayOfWeek(key) === 6);
      for (let h = 0; h < HOURS; h++) col.createDiv({ cls: "orc-hour-line" }).style.top = `${h * H}px`;
      const timed = instancesOnDay(instances, key).filter((i) => !i.allDay);
      for (const p of layoutOverlaps(timed)) {
        const ev = p.item;
        const el = col.createDiv({ cls: "orc-event" });
        el.__inst = ev;
        el.style.setProperty("--cal", ev.calendar.color);
        el.style.top = `${ev.start / 60 * H}px`;
        el.style.height = `${Math.max((ev.end - ev.start) / 60 * H, 14)}px`;
        const w = 100 / p.cols;
        el.style.left = `calc(${p.col * w}% + 1px)`;
        el.style.width = `calc(${w}% - 3px)`;
        if (ev.raw.kind === "reminder") {
          el.addClass("is-reminder");
          el.style.height = `${Math.max(Math.min(H / 2, 24), 18)}px`;
          const line = el.createDiv({ cls: "orc-event-title" });
          this.reminderCheck(line, ev);
          line.createSpan({ text: ev.title });
        } else {
          el.toggleClass("is-short", ev.end - ev.start < 45);
          el.createDiv({ cls: "orc-event-title", text: ev.title });
          if (ev.end - ev.start >= 45 || days.length === 1) {
            el.createDiv({ cls: "orc-event-time", text: `${formatTime(ev.start, this.ctx.hour12)} \u2013 ${formatTime(ev.end, this.ctx.hour12)}` });
          }
          el.createDiv({ cls: "orc-resize", attr: { "aria-label": "Drag to change end time" } });
        }
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.ctx.openEvent(ev);
        });
      }
      col.addEventListener("dblclick", (e) => {
        if (e.target.closest(".orc-event")) return;
        const start = this.minutesAt(col, e.clientY, true);
        this.ctx.createEvent(key, Math.min(start, 23 * 60), Math.min(start + 60, MAX_END));
      });
      if (key === today) this.renderNowLine(col);
    }
    this.attachGesture(inner, (x, y, target, touch) => {
      const evEl = target.closest(".orc-event");
      if (evEl) {
        const inst = evEl.__inst;
        if (!inst) return null;
        return target.closest(".orc-resize") ? this.resizeDrag(evEl, inst, cols, scroller) : this.moveDrag(evEl, inst, cols, scroller, x, y);
      }
      const col = target.closest(".orc-daycol");
      if (!col) return null;
      return this.createDrag(col, cols, scroller, y, touch);
    });
    const now = /* @__PURE__ */ new Date();
    const hasToday = days.includes(today);
    const firstEvent = instances.filter((i) => !i.allDay).map((i) => i.start).sort((a, b) => a - b)[0];
    const scrollTo = hasToday ? Math.max(0, (now.getHours() - 1.5) * H) : firstEvent != null ? Math.max(0, (firstEvent / 60 - 1) * H) : 8 * H;
    window.requestAnimationFrame(() => {
      scroller.scrollTop = scrollTo;
    });
  }
  // Minutes from midnight under a screen Y coordinate, snapped to 15 minutes.
  minutesAt(col, clientY, floor = false) {
    const r = col.getBoundingClientRect();
    const raw = (clientY - r.top) / this.ctx.hourHeight * 60;
    const snapped = floor ? Math.floor(raw / SNAP) * SNAP : Math.round(raw / SNAP) * SNAP;
    return Math.max(0, Math.min(24 * 60, snapped));
  }
  colAt(cols, clientX) {
    for (const c of cols) {
      const r = c.el.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return c;
    }
    const firstR = cols[0].el.getBoundingClientRect();
    return clientX < firstR.left ? cols[0] : cols[cols.length - 1];
  }
  // Scroll the time grid when dragging near its top or bottom edge.
  autoScroll(scroller, clientY) {
    const r = scroller.getBoundingClientRect();
    if (clientY < r.top + 36) scroller.scrollTop -= 12;
    else if (clientY > r.bottom - 36) scroller.scrollTop += 12;
  }
  makeGhost(col, color, title) {
    const g = col.createDiv({ cls: "orc-event orc-ghost" });
    g.style.setProperty("--cal", color);
    g.style.left = "1px";
    g.style.width = "calc(100% - 3px)";
    g.createDiv({ cls: "orc-event-title", text: title });
    g.createDiv({ cls: "orc-event-time" });
    return g;
  }
  paintGhost(g, start, end) {
    const H = this.ctx.hourHeight;
    g.style.top = `${start / 60 * H}px`;
    g.style.height = `${Math.max((end - start) / 60 * H, 14)}px`;
    const t = g.querySelector(".orc-event-time");
    if (t) t.setText(`${formatTime(start, this.ctx.hour12)} \u2013 ${formatTime(end, this.ctx.hour12)}`);
  }
  moveDrag(evEl, inst, cols, scroller, x0, y0) {
    var _a;
    const home = (_a = cols.find((c) => c.key === inst.date)) != null ? _a : cols[0];
    const dur = inst.end - inst.start;
    const grabOffset = (y0 - home.el.getBoundingClientRect().top) / this.ctx.hourHeight * 60 - inst.start;
    let col = home;
    let start = inst.start;
    evEl.addClass("is-lifted");
    let ghost = this.makeGhost(col.el, inst.calendar.color, inst.title);
    this.paintGhost(ghost, start, inst.end);
    void x0;
    return {
      move: (x, y) => {
        this.autoScroll(scroller, y);
        const c = this.colAt(cols, x);
        if (c !== col) {
          ghost.remove();
          col = c;
          ghost = this.makeGhost(col.el, inst.calendar.color, inst.title);
        }
        const r = col.el.getBoundingClientRect();
        const raw = (y - r.top) / this.ctx.hourHeight * 60 - grabOffset;
        start = Math.max(0, Math.min(24 * 60 - dur, Math.round(raw / SNAP) * SNAP));
        this.paintGhost(ghost, start, Math.min(start + dur, MAX_END));
      },
      end: () => {
        const dayDelta = diffDays(inst.date, col.key);
        const end = Math.min(start + dur, MAX_END);
        if (dayDelta === 0 && start === inst.start) {
          ghost.remove();
          evEl.removeClass("is-lifted");
          return;
        }
        this.ctx.moveEvent(inst, { dayDelta, start, end });
      },
      cancel: () => {
        ghost.remove();
        evEl.removeClass("is-lifted");
      }
    };
  }
  resizeDrag(evEl, inst, cols, scroller) {
    var _a;
    const col = (_a = cols.find((c) => c.key === inst.date)) != null ? _a : cols[0];
    let end = inst.end;
    evEl.addClass("is-lifted");
    const ghost = this.makeGhost(col.el, inst.calendar.color, inst.title);
    this.paintGhost(ghost, inst.start, end);
    return {
      move: (_x, y) => {
        this.autoScroll(scroller, y);
        end = Math.max(inst.start + SNAP, Math.min(MAX_END, this.minutesAt(col.el, y)));
        this.paintGhost(ghost, inst.start, end);
      },
      end: () => {
        if (end === inst.end) {
          ghost.remove();
          evEl.removeClass("is-lifted");
          return;
        }
        this.ctx.moveEvent(inst, { dayDelta: 0, start: inst.start, end });
      },
      cancel: () => {
        ghost.remove();
        evEl.removeClass("is-lifted");
      }
    };
  }
  // Drag on empty space: a see-through block in the default calendar's color, like Apple Calendar.
  // Drag on empty space: a see-through block in the default calendar's color, like Apple Calendar.
  // Dragging into another day's column makes one event that runs from the first day/time to the last.
  createDrag(colEl, cols, scroller, y0, touch) {
    const aKey = colEl.getAttribute("data-key");
    const anchor = Math.min(this.minutesAt(colEl, y0, true), 24 * 60 - SNAP);
    const color = this.ctx.newCalendarColor();
    let sKey = aKey, eKey = aKey;
    let start = anchor;
    let end = Math.min(anchor + (touch ? 60 : SNAP), MAX_END);
    let moved = false;
    let ghosts = [];
    const paint = () => {
      var _a;
      ghosts.forEach((g) => g.remove());
      ghosts = [];
      const i0 = cols.findIndex((c) => c.key === sKey), i1 = cols.findIndex((c) => c.key === eKey);
      for (let i = i0; i <= i1; i++) {
        const g = this.makeGhost(cols[i].el, color, i === i0 ? "New Event" : "");
        g.addClass("is-new");
        this.paintGhost(g, i === i0 ? start : 0, i === i1 ? end : 24 * 60);
        if (i !== i1) (_a = g.querySelector(".orc-event-time")) == null ? void 0 : _a.setText("");
        ghosts.push(g);
      }
    };
    paint();
    return {
      move: (x, y) => {
        this.autoScroll(scroller, y);
        const col = this.colAt(cols, x);
        const cur = this.minutesAt(col.el, y);
        if (!moved && col.key === aKey && Math.abs(cur - anchor) < SNAP && touch) return;
        moved = true;
        const before = cmpKey(col.key, aKey) < 0 || col.key === aKey && cur < anchor;
        if (before) {
          sKey = col.key;
          start = Math.min(cur, 24 * 60 - SNAP);
          eKey = aKey;
          end = anchor;
        } else {
          sKey = aKey;
          start = anchor;
          eKey = col.key;
          end = cur;
        }
        if (sKey === eKey && end - start < SNAP) end = start + SNAP;
        end = Math.min(end, MAX_END);
        paint();
      },
      end: () => {
        if (!touch && !moved) {
          ghosts.forEach((g) => g.remove());
          return;
        }
        const clear = () => ghosts.forEach((g) => g.remove());
        this.ctx.createEvent(sKey, start, end, clear, false, eKey !== sKey ? eKey : void 0);
      },
      cancel: () => ghosts.forEach((g) => g.remove())
    };
  }
  renderNowLine(col) {
    const line = col.createDiv({ cls: "orc-now" });
    const update = () => {
      if (!this.root.isConnected) return;
      const now = /* @__PURE__ */ new Date();
      line.style.top = `${(now.getHours() * 60 + now.getMinutes()) / 60 * this.ctx.hourHeight}px`;
    };
    update();
    this.nowTimer = window.setInterval(update, 6e4);
  }
  // ---------- day ----------
  renderDay() {
    const key = this.state.cursor;
    this.selected = key;
    const today = todayKey();
    const ws = this.weekStartOf(key);
    const strip = this.body.createDiv({ cls: "orc-strip" });
    for (let i = 0; i < 7; i++) {
      const k = addDays(ws, i);
      const d = strip.createDiv({ cls: "orc-strip-day" });
      d.toggleClass("is-today", k === today);
      d.toggleClass("is-selected", k === key);
      d.toggleClass("is-weekend", dayOfWeek(k) === 0 || dayOfWeek(k) === 6);
      d.createDiv({ cls: "orc-strip-dow", text: DAY_SHORT[dayOfWeek(k)][0] });
      d.createDiv({ cls: "orc-strip-num", text: String(keyParts(k).d) });
      d.addEventListener("click", () => this.setCursor(k));
    }
    const p = keyParts(key);
    const label = this.body.createDiv({ cls: "orc-day-label" });
    label.toggleClass("is-today", key === today);
    label.setText(`${DAY_NAMES[dayOfWeek(key)]}, ${MONTH_NAMES[p.m - 1]} ${p.d}, ${p.y}`);
    const instances = this.ctx.getInstances(key, key);
    this.renderAllDayRow([key], instances);
    this.renderTimeGrid([key], instances);
  }
};
function icon(parent, name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const add = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  };
  const line = (x1, y1, x2, y2) => add("line", { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) });
  if (name === "calendar-plus") {
    add("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" });
    line(3, 10, 21, 10);
    line(8, 3, 8, 7);
    line(16, 3, 16, 7);
    line(12, 13, 12, 18);
    line(9.5, 15.5, 14.5, 15.5);
  } else if (name === "reminders") {
    for (const y of [6, 12, 18]) {
      add("circle", { cx: "5", cy: String(y), r: "2" });
      line(10, y, 21, y);
    }
  } else if (name === "search") {
    add("circle", { cx: "11", cy: "11", r: "7" });
    line(16.5, 16.5, 21, 21);
  } else {
    line(12, 5, 12, 19);
    line(5, 12, 19, 12);
  }
  parent.appendChild(svg);
}

// src/modal.ts
var import_obsidian = require("obsidian");

// src/ics.ts
var BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
var MAX_EXPORT_DESC_CHARS = 2e6;
function toICS(items, calendarName, now = /* @__PURE__ */ new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Syncthing Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`
  ];
  const stamp = utcStamp(now);
  let budget = MAX_EXPORT_DESC_CHARS;
  for (const { raw, notes } of items) {
    const desc = (notes != null ? notes : "").trim().slice(0, Math.min(2e4, budget));
    budget -= desc.length;
    const ev = eventLines(raw, desc, stamp);
    if (ev) lines.push(...ev);
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
function eventLines(raw, notes, stamp) {
  var _a, _b, _c, _d;
  const out = ["BEGIN:VEVENT", `UID:${uidFor(raw)}`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(raw.title)}`];
  let firstDay = null;
  let rule = null;
  let exdates = [];
  if (raw.type === "single") {
    firstDay = raw.date;
  } else if (raw.type === "recurring") {
    const from = (_a = raw.startRecur) != null ? _a : "2000-01-02";
    let d = from;
    for (let i = 0; i < 7 && !raw.daysOfWeek.includes(dayOfWeek(d)); i++) d = addDays(d, 1);
    firstDay = d;
    rule = `FREQ=WEEKLY;BYDAY=${raw.daysOfWeek.map((n) => BYDAY[n]).join(",")}`;
    if (raw.endRecur) rule += `;UNTIL=${untilValue(raw.endRecur, raw.allDay)}`;
    exdates = (_b = raw.skipDates) != null ? _b : [];
  } else {
    firstDay = raw.startDate;
    const r = parseRRule(raw.rrule);
    if (!r) return null;
    rule = `FREQ=${r.freq}`;
    if (r.interval > 1) rule += `;INTERVAL=${r.interval}`;
    if (r.byDay && r.byDay.length) rule += `;BYDAY=${r.byDay.map((n) => BYDAY[n]).join(",")}`;
    if (r.byMonthDay && r.byMonthDay.length) rule += `;BYMONTHDAY=${r.byMonthDay.join(",")}`;
    if (r.count != null && !isNaN(r.count)) rule += `;COUNT=${r.count}`;
    else if (r.until) rule += `;UNTIL=${untilValue(r.until, raw.allDay)}`;
    exdates = (_c = raw.skipDates) != null ? _c : [];
  }
  if (!firstDay || !isValidKey(firstDay)) return null;
  const multiEnd = raw.type === "single" && raw.endDate && cmpKey(raw.endDate, firstDay) > 0 ? raw.endDate : null;
  if (raw.allDay) {
    out.push(`DTSTART;VALUE=DATE:${compact(firstDay)}`);
    out.push(`DTEND;VALUE=DATE:${compact(addDays(multiEnd != null ? multiEnd : firstDay, 1))}`);
    for (const x of exdates) out.push(`EXDATE;VALUE=DATE:${compact(x)}`);
  } else {
    const start = raw.startTime;
    const end = raw.endTime != null && raw.endTime > start ? raw.endTime : start + 60;
    out.push(`DTSTART:${compact(firstDay)}T${hhmm(start)}00`);
    out.push(`DTEND:${endStamp(multiEnd != null ? multiEnd : firstDay, end)}`);
    for (const x of exdates) out.push(`EXDATE:${compact(x)}T${hhmm(start)}00`);
  }
  if (rule) out.push(`RRULE:${rule}`);
  if (raw.location) out.push(`LOCATION:${esc(raw.location)}`);
  if (raw.url && /^https?:\/\/\S{1,500}$/i.test(raw.url)) out.push(`URL:${raw.url}`);
  if (notes) out.push(`DESCRIPTION:${esc(notes)}`);
  for (const a of (_d = raw.alerts) != null ? _d : []) {
    out.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(raw.title)}`, `TRIGGER:${a === 0 ? "PT0M" : `-PT${a}M`}`, "END:VALARM");
  }
  out.push("END:VEVENT");
  return out;
}
function uidFor(raw) {
  let h1 = 2166136261, h2 = 16777619;
  for (let i = 0; i < raw.path.length; i++) {
    const c = raw.path.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 1540483477) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}@orchard.local`;
}
function compact(key) {
  return key.replace(/-/g, "");
}
function hhmm(min) {
  return minutesToHHMM(Math.min(min, 1439)).replace(":", "");
}
function endStamp(day, min) {
  if (min >= 1440) return `${compact(addDays(day, 1))}T000000`;
  return `${compact(day)}T${hhmm(min)}00`;
}
function untilValue(key, allDay) {
  return allDay ? compact(key) : `${compact(key)}T235959`;
}
function utcStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function esc(s) {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}
function utf8Len(cp) {
  return cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
}
function fold(line) {
  if (line.length <= 18) return line;
  const parts = [];
  let start = 0, bytes = 0, limit = 75;
  for (let i = 0; i < line.length; ) {
    const cp = line.codePointAt(i);
    const w = cp > 65535 ? 2 : 1;
    const n = utf8Len(cp);
    if (bytes + n > limit) {
      parts.push(line.slice(start, i));
      start = i;
      bytes = 0;
      limit = 74;
    }
    bytes += n;
    i += w;
  }
  parts.push(line.slice(start));
  return parts.join("\r\n ");
}
var MAX_ICS_BYTES = 5 * 1024 * 1024;
var MAX_ICS_EVENTS = 5e3;
var MAX_SKIP_DATES = 1e3;
function parseICS(text) {
  var _a, _b;
  if (text.length > MAX_ICS_BYTES) throw new Error("File is larger than 5 MB.");
  const lines = unfold(text);
  const events = [];
  let skipped = 0;
  let cur = null;
  let inAlarm = false;
  let alarmTriggers = [];
  let depth = 0;
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN") {
      if (p.value === "VEVENT" && !cur) {
        cur = {};
        alarmTriggers = [];
        depth = 0;
        inAlarm = false;
      } else if (cur && p.value === "VALARM") inAlarm = true;
      else if (cur) depth++;
      continue;
    }
    if (p.name === "END") {
      if (cur && depth > 0) {
        depth--;
        continue;
      }
      if (p.value === "VEVENT" && cur) {
        if (events.length >= MAX_ICS_EVENTS) {
          skipped++;
          cur = null;
          continue;
        }
        const ev = buildEvent(cur, alarmTriggers);
        if (ev) events.push(ev);
        else skipped++;
        cur = null;
      } else if (cur && p.value === "VALARM") inAlarm = false;
      continue;
    }
    if (!cur || depth > 0) continue;
    if (inAlarm) {
      if (p.name === "TRIGGER" && alarmTriggers.length < 20) alarmTriggers.push(p.value);
      continue;
    }
    ((_b = cur[_a = p.name]) != null ? _b : cur[_a] = []).push({ params: p.params, value: p.value });
  }
  return { events, skipped };
}
function unfold(text) {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out = [];
  for (const l of raw) {
    if ((l.startsWith(" ") || l.startsWith("	")) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out;
}
function parseLine(line) {
  if (line.length > 1e5) return null;
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
  const params = /* @__PURE__ */ Object.create(null);
  for (const s of segs.slice(1, 20)) {
    const eq = s.indexOf("=");
    if (eq > 0) params[s.slice(0, eq).toUpperCase()] = s.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, params, value };
}
function buildEvent(p, triggers) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
  const ds = (_a = p.DTSTART) == null ? void 0 : _a[0];
  if (!ds) return null;
  const start = parseDateTime(ds.value, ds.params);
  if (!start) return null;
  let end = null;
  const de = (_b = p.DTEND) == null ? void 0 : _b[0];
  if (de) end = parseDateTime(de.value, de.params);
  else if ((_c = p.DURATION) == null ? void 0 : _c[0]) end = addDuration(start, p.DURATION[0].value);
  const allDay = start.min == null;
  const ev = {
    title: unesc((_f = (_e = (_d = p.SUMMARY) == null ? void 0 : _d[0]) == null ? void 0 : _e.value) != null ? _f : "").slice(0, 300) || "Untitled event",
    date: start.date,
    endDate: null,
    allDay,
    startTime: start.min,
    endTime: null,
    rrule: null,
    skipDates: [],
    alerts: [...new Set(triggers.map(parseTrigger).filter((n) => n != null))].sort((a, b) => b - a).slice(0, 4)
  };
  if (allDay) {
    if (end && end.min == null) {
      const last = addDays(end.date, -1);
      if (cmpKey(last, start.date) > 0) ev.endDate = last;
    }
  } else if (end) {
    if (end.date === start.date) ev.endTime = end.min;
    else if (cmpKey(end.date, start.date) > 0) {
      if (end.min === 0 && addDays(start.date, 1) === end.date) ev.endTime = 1439;
      else {
        ev.endDate = end.date;
        ev.endTime = end.min;
      }
    }
  }
  const rr = (_h = (_g = p.RRULE) == null ? void 0 : _g[0]) == null ? void 0 : _h.value;
  if (rr) {
    const rule = parseRRule("RRULE:" + rr);
    if (!rule || /(^|;)(BYSETPOS|BYMONTH|BYYEARDAY|BYWEEKNO|BYHOUR|BYMINUTE|BYSECOND)=/i.test(rr) || /BYDAY=[^;]*[+-]?\d/i.test(rr)) return null;
    ev.rrule = "RRULE:" + rr.split(";").filter((part) => /^(FREQ|INTERVAL|COUNT|UNTIL|BYDAY|BYMONTHDAY)=/i.test(part)).join(";");
    ev.endDate = null;
    exdates: for (const x of (_i = p.EXDATE) != null ? _i : []) {
      for (const v of x.value.split(",", 1e3)) {
        if (ev.skipDates.length >= MAX_SKIP_DATES) break exdates;
        const d = parseDateTime(v, x.params);
        if (d) ev.skipDates.push(d.date);
      }
    }
  }
  const loc = (_k = (_j = p.LOCATION) == null ? void 0 : _j[0]) == null ? void 0 : _k.value;
  if (loc) ev.location = unesc(loc).slice(0, 300);
  const url = (_m = (_l = p.URL) == null ? void 0 : _l[0]) == null ? void 0 : _m.value;
  if (url && /^https?:\/\/[^\s]{1,500}$/i.test(url.trim())) ev.url = url.trim();
  const desc = (_o = (_n = p.DESCRIPTION) == null ? void 0 : _n[0]) == null ? void 0 : _o.value;
  if (desc) ev.notes = neutralizeMarkdown(unesc(desc).slice(0, 2e4));
  return ev;
}
function parseDateTime(v, params) {
  const m = v.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4] || params.VALUE === "DATE") {
    const key2 = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidKey(key2) ? { date: key2, min: null } : null;
  }
  let y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
  if (h > 23 || mi > 59 || y < 1e3) return null;
  if (m[7] === "Z") {
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
    y = dt.getFullYear();
    mo = dt.getMonth() + 1;
    d = dt.getDate();
    h = dt.getHours();
    mi = dt.getMinutes();
  }
  const key = `${String(y).padStart(4, "0")}-${pad(mo)}-${pad(d)}`;
  return isValidKey(key) ? { date: key, min: h * 60 + mi } : null;
}
function addDuration(start, dur) {
  var _a, _b, _c, _d;
  const m = dur.match(/^P(?:(\d{1,4})W)?(?:(\d{1,4})D)?(?:T(?:(\d{1,4})H)?(?:(\d{1,4})M)?(?:\d{1,5}S)?)?$/);
  if (!m) return null;
  const days = +((_a = m[1]) != null ? _a : 0) * 7 + +((_b = m[2]) != null ? _b : 0);
  const mins = +((_c = m[3]) != null ? _c : 0) * 60 + +((_d = m[4]) != null ? _d : 0);
  if (start.min == null) return { date: addDays(start.date, days), min: null };
  const total = start.min + mins;
  return { date: addDays(start.date, days + Math.floor(total / 1440)), min: total % 1440 };
}
function parseTrigger(t) {
  var _a, _b, _c, _d;
  if (!t) return null;
  const m = t.trim().match(/^([+-]?)P(?:(\d{1,3})W)?(?:(\d{1,3})D)?(?:T(?:(\d{1,3})H)?(?:(\d{1,4})M)?(?:\d{1,5}S)?)?$/);
  if (!m) return null;
  const min = +((_a = m[2]) != null ? _a : 0) * 10080 + +((_b = m[3]) != null ? _b : 0) * 1440 + +((_c = m[4]) != null ? _c : 0) * 60 + +((_d = m[5]) != null ? _d : 0);
  if (m[1] !== "-" && min !== 0) return null;
  return min <= 40320 ? min : null;
}
function unesc(s) {
  return s.replace(/\\([\\;,nN])/g, (_m, c) => c === "n" || c === "N" ? "\n" : c).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}
function neutralizeMarkdown(s) {
  return s.replace(/!\[/g, "!\\[").replace(/</g, "\\<").replace(/`/g, "\\`").replace(/\$\{/g, "$\\{");
}

// src/modal.ts
function repeatOf(raw) {
  var _a;
  if (raw.type === "recurring") {
    const days = [...raw.daysOfWeek].sort().join(",");
    return { repeat: days === "1,2,3,4,5" ? "weekdays" : "weekly", until: (_a = raw.endRecur) != null ? _a : null };
  }
  if (raw.type === "rrule") {
    const r = parseRRule(raw.rrule);
    const u = raw.rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/i);
    const until = u ? `${u[1]}-${u[2]}-${u[3]}` : null;
    if (!r) return { repeat: "none", until };
    if (r.freq === "WEEKLY" && r.interval === 2) return { repeat: "biweekly", until };
    return { repeat: r.freq.toLowerCase(), until };
  }
  return { repeat: "none", until: null };
}
function describeRepeat(raw) {
  if (raw.type === "recurring") {
    const names = raw.daysOfWeek.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
    return `Every ${names}` + (raw.endRecur ? ` until ${raw.endRecur}` : "");
  }
  if (raw.type === "rrule") return describeRRule(raw.rrule);
  return null;
}
var REPEAT_LABELS = {
  none: "Never",
  daily: "Every day",
  weekdays: "Every weekday (Mon\u2013Fri)",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year"
};
function alertLabel(min) {
  if (min == null) return "None";
  if (min === 0) return "At time of event";
  if (min % 10080 === 0) return `${min / 10080} week${min === 10080 ? "" : "s"} before`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"} before`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"} before`;
  return `${min} minutes before`;
}
var EventDetailsModal = class extends import_obsidian.Modal {
  constructor(app, inst, store) {
    super(app);
    this.inst = inst;
    this.store = store;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    const ev = this.inst;
    const h12 = this.store.hour12();
    const head = contentEl.createDiv({ cls: "orc-detail-head" });
    const bar = head.createDiv({ cls: "orc-detail-bar" });
    bar.style.background = ev.calendar.color;
    const t = head.createDiv();
    t.createDiv({ cls: "orc-detail-title", text: ev.title });
    t.createDiv({ cls: "orc-muted", text: ev.calendar.name });
    const p = keyParts(ev.date);
    const when = contentEl.createDiv({ cls: "orc-detail-when" });
    when.createDiv({ text: `${DAY_NAMES[dayOfWeek(ev.date)]}, ${MONTH_NAMES[p.m - 1]} ${p.d}, ${p.y}` });
    if (ev.multiDay) {
      const e = keyParts(ev.endDate);
      when.createDiv({ text: `to ${DAY_NAMES[dayOfWeek(ev.endDate)]}, ${MONTH_NAMES[e.m - 1]} ${e.d}, ${e.y}` });
    } else if (ev.allDay) when.createDiv({ cls: "orc-muted", text: "All day" });
    else when.createDiv({ cls: "orc-muted", text: `${formatTime(ev.start, h12)} \u2013 ${formatTime(ev.end, h12)}` });
    const rep = describeRepeat(ev.raw);
    if (rep) when.createDiv({ cls: "orc-muted", text: "Repeats: " + rep });
    if (ev.raw.location) when.createDiv({ text: "Location: " + ev.raw.location });
    if (ev.raw.url) when.createDiv({ cls: "orc-muted orc-selectable", text: ev.raw.url });
    if (ev.raw.alerts.length) when.createDiv({ cls: "orc-muted", text: (ev.raw.alerts.length === 1 ? "Alert: " : "Alerts: ") + ev.raw.alerts.map(alertLabel).join(", ") });
    const notes = contentEl.createDiv({ cls: "orc-detail-notes orc-selectable" });
    void this.store.readBody(ev.raw).then((b) => {
      const txt = b.trim();
      if (txt) notes.setText(txt.slice(0, 2e3));
    });
    const recurring = ev.raw.type !== "single";
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Open note" }).addEventListener("click", () => {
      this.close();
      void this.store.openNote(ev.raw);
    });
    btns.createEl("button", { text: "Duplicate" }).addEventListener("click", async () => {
      this.close();
      try {
        await this.store.duplicateEvent(ev.raw);
        new import_obsidian.Notice("Event duplicated");
      } catch (e) {
        new import_obsidian.Notice("Could not duplicate the event.");
      }
    });
    btns.createEl("button", { text: "Delete", cls: "mod-warning" }).addEventListener("click", () => {
      this.close();
      const body = "The note goes to the trash chosen in Obsidian's 'Deleted files' setting. Copies may remain in your system trash, Syncthing versioning and Obsidian File Recovery until you clear those.";
      if (recurring) {
        new ScopeModal(this.app, `Delete "${ev.title}"?`, "This is a repeating event.", "Delete this event only", "Delete all events", async (scope) => {
          try {
            if (scope === "this") await this.store.deleteOccurrence(ev.raw, ev.date);
            else await this.store.deleteEvent(ev.raw);
          } catch (e) {
            new import_obsidian.Notice("Could not delete the event.");
          }
        }, true).open();
      } else {
        new ConfirmModal(this.app, `Delete "${ev.title}"?`, body, async () => {
          try {
            await this.store.deleteEvent(ev.raw);
          } catch (e) {
            new import_obsidian.Notice("Could not delete the note.");
          }
        }).open();
      }
    });
    btns.createEl("button", { text: "Edit", cls: "mod-cta" }).addEventListener("click", () => {
      this.close();
      new EventFormModal(this.app, this.store, { raw: ev.raw, instanceDate: ev.date }).open();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends import_obsidian.Modal {
  constructor(app, title, body, onConfirm, okText = "Delete") {
    super(app);
    this.title = title;
    this.body = body;
    this.onConfirm = onConfirm;
    this.okText = okText;
  }
  onOpen() {
    this.modalEl.addClass("orc-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: this.title });
    this.contentEl.createDiv({ cls: "orc-muted", text: this.body });
    const btns = this.contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const ok = btns.createEl("button", { text: this.okText, cls: "mod-warning" });
    ok.addEventListener("click", () => {
      this.close();
      void this.onConfirm();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ScopeModal = class extends import_obsidian.Modal {
  constructor(app, title, body, thisText, allText, onPick, destructive = false, onCancel) {
    super(app);
    this.title = title;
    this.body = body;
    this.thisText = thisText;
    this.allText = allText;
    this.onPick = onPick;
    this.destructive = destructive;
    this.onCancel = onCancel;
    this.done = false;
  }
  onOpen() {
    this.modalEl.addClass("orc-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: this.title });
    this.contentEl.createDiv({ cls: "orc-muted", text: this.body });
    const btns = this.contentEl.createDiv({ cls: "orc-detail-btns orc-scope-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const cls = this.destructive ? "mod-warning" : "mod-cta";
    btns.createEl("button", { text: this.thisText, cls }).addEventListener("click", () => {
      this.done = true;
      this.close();
      void this.onPick("this");
    });
    btns.createEl("button", { text: this.allText, cls }).addEventListener("click", () => {
      this.done = true;
      this.close();
      void this.onPick("all");
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.done && this.onCancel) this.onCancel();
  }
};
var EventFormModal = class _EventFormModal extends import_obsidian.Modal {
  constructor(app, store, init) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    super(app);
    this.store = store;
    this.init = init;
    this.originalBody = null;
    this.saved = false;
    this.raw = (_a = init.raw) != null ? _a : null;
    this.instanceDate = (_b = init.instanceDate) != null ? _b : null;
    const cals = store.getCalendars();
    if (this.raw) {
      const r = this.raw;
      const rep = repeatOf(r);
      const seriesStart = r.type === "single" ? r.date : r.type === "recurring" ? (_c = r.startRecur) != null ? _c : "" : r.startDate;
      this.v = {
        title: r.title,
        calendar: r.calendar.name,
        // Like Apple Calendar, a repeating event opens on the occurrence you tapped.
        date: r.type !== "single" && this.instanceDate ? this.instanceDate : seriesStart,
        endDate: r.type === "single" ? (_d = r.endDate) != null ? _d : null : null,
        allDay: r.allDay,
        startTime: r.startTime,
        endTime: r.endTime,
        repeat: rep.repeat,
        repeatUntil: rep.until,
        location: (_e = r.location) != null ? _e : "",
        url: (_f = r.url) != null ? _f : "",
        alerts: [...r.alerts],
        notes: null
      };
    } else {
      const start = (_g = init.startMinutes) != null ? _g : 9 * 60;
      const end = (_h = init.endMinutes) != null ? _h : Math.min(start + 60, 23 * 60 + 59);
      this.v = {
        title: "",
        calendar: init.defaultCalendar && cals.some((c) => c.name === init.defaultCalendar) ? init.defaultCalendar : (_j = (_i = cals[0]) == null ? void 0 : _i.name) != null ? _j : "",
        date: (_k = init.date) != null ? _k : todayKey(),
        endDate: init.endDate && init.date && init.endDate > init.date ? init.endDate : null,
        allDay: (_l = init.allDay) != null ? _l : false,
        startTime: start,
        endTime: end,
        repeat: "none",
        repeatUntil: null,
        location: "",
        url: "",
        alerts: [],
        notes: ""
      };
    }
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    modalEl.addClass("orc-form");
    contentEl.empty();
    if (!this.raw) {
      kindToggle(contentEl, "event", () => {
        this.saved = true;
        this.close();
        new ReminderFormModal(this.app, this.store, {
          title: this.v.title,
          due: this.v.date,
          dueTime: this.v.allDay ? null : this.v.startTime,
          onCancel: this.init.onCancel,
          eventInit: this.init
        }).open();
      });
    }
    contentEl.createEl("h3", { text: this.raw ? "Edit event" : "New event" });
    const cals = this.store.getCalendars();
    if (!cals.length) {
      renderNoCalendars(contentEl, this.app, this.store, () => {
        this.close();
        new _EventFormModal(this.app, this.store, this.init).open();
      });
      return;
    }
    let endDateInput = null;
    let untilInput = null;
    new import_obsidian.Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("New event").setValue(this.v.title).onChange((x) => this.v.title = x);
      t.inputEl.addClass("orc-wide");
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });
      if (!import_obsidian.Platform.isMobile) window.setTimeout(() => t.inputEl.focus(), 50);
    });
    new import_obsidian.Setting(contentEl).setName("Location").addText((t) => {
      var _a;
      t.setPlaceholder("Optional").setValue((_a = this.v.location) != null ? _a : "").onChange((x) => this.v.location = x);
      t.inputEl.addClass("orc-wide");
    });
    const calRow = new import_obsidian.Setting(contentEl).setName("Calendar").addDropdown((d) => {
      for (const c of cals) d.addOption(c.name, c.name);
      d.setValue(this.v.calendar).onChange((x) => {
        this.v.calendar = x;
        paintDot();
      });
    });
    const dot = createDot(calRow.settingEl);
    const paintDot = () => {
      var _a, _b;
      dot.style.background = (_b = (_a = cals.find((c) => c.name === this.v.calendar)) == null ? void 0 : _a.color) != null ? _b : "transparent";
    };
    paintDot();
    new import_obsidian.Setting(contentEl).setName("All-day").addToggle(
      (t) => t.setValue(this.v.allDay).onChange((x) => {
        this.v.allDay = x;
        showTimes();
      })
    );
    new import_obsidian.Setting(contentEl).setName("Date").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.v.date).onChange((x) => this.v.date = x);
    });
    let endInput = null;
    const startRow = new import_obsidian.Setting(contentEl).setName("Starts").addText((t) => {
      t.inputEl.type = "time";
      t.setValue(this.v.startTime != null ? minutesToHHMM(Math.min(this.v.startTime, 1439)) : "09:00").onChange((x) => {
        this.v.startTime = parseTime(x);
        const s = this.v.startTime;
        const multiDay = !!this.v.endDate && this.v.endDate > this.v.date;
        if (s != null && !multiDay && (this.v.endTime == null || this.v.endTime <= s)) {
          this.v.endTime = Math.min(s + 30, 23 * 60 + 59);
          if (endInput) endInput.value = minutesToHHMM(this.v.endTime);
        }
      });
    });
    const endRow = new import_obsidian.Setting(contentEl).setName("Ends").addText((t) => {
      endInput = t.inputEl;
      t.inputEl.type = "time";
      t.setValue(this.v.endTime != null ? minutesToHHMM(Math.min(this.v.endTime, 1439)) : "10:00").onChange((x) => this.v.endTime = parseTime(x));
    });
    const showTimes = () => {
      startRow.settingEl.style.display = this.v.allDay ? "none" : "";
      endRow.settingEl.style.display = this.v.allDay ? "none" : "";
    };
    showTimes();
    const endDateRow = new import_obsidian.Setting(contentEl).setName("End date").setDesc("Only for multi-day events").addText((t) => {
      var _a;
      t.inputEl.type = "date";
      t.setValue((_a = this.v.endDate) != null ? _a : "").onChange((x) => this.v.endDate = x || null);
      endDateInput = t.inputEl;
    }).addButton((b) => b.setButtonText("Clear").onClick(() => {
      this.v.endDate = null;
      if (endDateInput) endDateInput.value = "";
    }));
    new import_obsidian.Setting(contentEl).setName("Repeat").addDropdown((d) => {
      d.addOptions(REPEAT_LABELS);
      d.setValue(this.v.repeat).onChange((x) => {
        this.v.repeat = x;
        showRepeat();
      });
    });
    const untilRow = new import_obsidian.Setting(contentEl).setName("End repeat").setDesc("Leave empty for never").addText((t) => {
      var _a;
      t.inputEl.type = "date";
      t.setValue((_a = this.v.repeatUntil) != null ? _a : "").onChange((x) => this.v.repeatUntil = x || null);
      untilInput = t.inputEl;
    }).addButton((b) => b.setButtonText("Clear").onClick(() => {
      this.v.repeatUntil = null;
      if (untilInput) untilInput.value = "";
    }));
    const showRepeat = () => {
      untilRow.settingEl.style.display = this.v.repeat === "none" ? "none" : "";
      endDateRow.settingEl.style.display = this.v.repeat === "none" ? "" : "none";
    };
    showRepeat();
    const urlRow = new import_obsidian.Setting(contentEl).setName("URL").addText((t) => {
      var _a;
      t.setPlaceholder("Optional").setValue((_a = this.v.url) != null ? _a : "").onChange((x) => this.v.url = x);
      t.inputEl.addClass("orc-wide");
    });
    let alertRows = [];
    const names = ["Alert", "Second alert", "Third alert", "Fourth alert"];
    const renderAlerts = () => {
      var _a;
      alertRows.forEach((r) => r.remove());
      alertRows = [];
      const list = (_a = this.v.alerts) != null ? _a : this.v.alerts = [];
      const rows = Math.min(MAX_ALERTS, list.length + 1);
      for (let i = 0; i < rows; i++) {
        const row = new import_obsidian.Setting(contentEl).setName(names[i]);
        if (i === 0) row.setDesc(alertHint());
        row.addDropdown((d) => {
          d.addOption("", "None");
          for (const m of ALERT_CHOICES) d.addOption(String(m), alertLabel(m));
          d.setValue(list[i] == null ? "" : String(list[i])).onChange((x) => {
            if (x === "") list.splice(i, 1);
            else list[i] = parseInt(x, 10);
            this.v.alerts = [...new Set(list)];
            renderAlerts();
          });
        });
        row.settingEl.addClass("orc-alert-row");
        contentEl.insertBefore(row.settingEl, urlRow.settingEl);
        alertRows.push(row.settingEl);
      }
    };
    renderAlerts();
    const notesWrap = contentEl.createDiv({ cls: "orc-notes" });
    notesWrap.createDiv({ cls: "setting-item-name", text: "Notes" });
    const notes = notesWrap.createEl("textarea", { cls: "orc-notes-input", attr: { rows: 4, placeholder: "Written into the event's note" } });
    notes.addEventListener("input", () => this.v.notes = notes.value);
    if (this.raw) {
      notes.setAttribute("disabled", "true");
      void this.store.readBody(this.raw).then((b) => {
        this.originalBody = b;
        notes.value = b;
        notes.removeAttribute("disabled");
      });
    }
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btns.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => void this.save());
  }
  async save() {
    const v = this.v;
    if (!v.title.trim()) {
      new import_obsidian.Notice("Give the event a title.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
      new import_obsidian.Notice("Pick a date.");
      return;
    }
    if (!v.allDay) {
      if (v.startTime == null) {
        new import_obsidian.Notice("Pick a start time.");
        return;
      }
      const multiDay = !!v.endDate && v.endDate > v.date;
      if (!multiDay && v.endTime != null && v.endTime <= v.startTime) {
        new import_obsidian.Notice("End time must be after start time.");
        return;
      }
    }
    if (v.endDate && v.endDate <= v.date) v.endDate = null;
    if (v.repeat !== "none") v.endDate = null;
    if (v.url && !/^https?:\/\/\S+$/i.test(v.url.trim())) {
      new import_obsidian.Notice("URL must start with http:// or https://");
      return;
    }
    if (this.raw && v.notes != null && v.notes === this.originalBody) v.notes = null;
    const commit = async (scope) => {
      var _a, _b;
      try {
        if (!this.raw) await this.store.createEvent(v);
        else if (scope === "this") await this.store.updateOccurrence(this.raw, this.instanceDate, { ...v, repeat: "none", repeatUntil: null });
        else await this.store.updateEvent(this.raw, v, (_a = this.instanceDate) != null ? _a : void 0);
        this.saved = true;
        this.close();
      } catch (e) {
        new import_obsidian.Notice(((_b = e.message) == null ? void 0 : _b.startsWith("SC:")) ? e.message.slice(3) : "Could not save the event. Check that the calendar folder still exists.");
      }
    };
    if (this.raw && this.raw.type !== "single" && this.instanceDate && v.repeat !== "none") {
      new ScopeModal(this.app, "Save changes", "This is a repeating event.", "This event only", "All events", (s) => commit(s)).open();
    } else await commit(null);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.saved && this.init.onCancel) this.init.onCancel();
  }
};
function createDot(settingEl) {
  var _a;
  const ctrl = (_a = settingEl.querySelector(".setting-item-control")) != null ? _a : settingEl;
  const dot = document.createElement("span");
  dot.className = "orc-cal-dot";
  ctrl.insertBefore(dot, ctrl.firstChild);
  return dot;
}
var WORD = {
  none: "",
  daily: "every day",
  weekdays: "",
  weekly: "",
  biweekly: "every 2 weeks",
  monthly: "every month",
  yearly: "every year"
};
var BYDAY2 = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function frontmatterFor(v, original, opaque = false) {
  var _a, _b;
  const fm = baseFields(v);
  const name = opaque ? randomCode() : safeName(v.title);
  const untilCompact = v.repeatUntil ? v.repeatUntil.replace(/-/g, "") : null;
  const sameRepeat = original ? repeatOf(original).repeat === v.repeat : false;
  if (original && sameRepeat && original.type === "recurring") {
    fm.type = "recurring";
    fm.daysOfWeek = original.daysOfWeek.map((d) => WEEKDAY_LETTERS[d]);
    const startRecur = original.startRecur ? v.date || original.startRecur : void 0;
    if (startRecur) fm.startRecur = startRecur;
    if (v.repeatUntil) fm.endRecur = v.repeatUntil;
    if ((_a = original.skipDates) == null ? void 0 : _a.length) fm.skipDates = original.skipDates;
    return { fm, basename: `(Every ${fm.daysOfWeek.join(",")}) ${name}` };
  }
  if (original && sameRepeat && original.type === "rrule") {
    fm.type = "rrule";
    fm.startDate = v.date;
    const base = original.rrule.replace(/;?UNTIL=[^;]*/i, "");
    fm.rrule = base + (untilCompact ? `;UNTIL=${untilCompact}` : "");
    fm.skipDates = (_b = original.skipDates) != null ? _b : [];
    return { fm, basename: `(${describeRRule(fm.rrule)}) ${name}` };
  }
  switch (v.repeat) {
    case "none":
      fm.type = "single";
      fm.date = v.date;
      if (v.endDate) fm.endDate = v.endDate;
      return { fm, basename: `${v.date} ${name}` };
    case "weekly":
    case "weekdays": {
      const letters = v.repeat === "weekdays" ? ["M", "T", "W", "R", "F"] : [WEEKDAY_LETTERS[dayOfWeek(v.date)]];
      fm.type = "recurring";
      fm.daysOfWeek = letters;
      fm.startRecur = v.date;
      if (v.repeatUntil) fm.endRecur = v.repeatUntil;
      return { fm, basename: `(Every ${letters.join(",")}) ${name}` };
    }
    default: {
      fm.type = "rrule";
      fm.startDate = v.date;
      fm.rrule = v.repeat === "biweekly" ? `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${BYDAY2[dayOfWeek(v.date)]}` : `RRULE:FREQ=${v.repeat.toUpperCase()}`;
      if (untilCompact) fm.rrule += `;UNTIL=${untilCompact}`;
      fm.skipDates = [];
      return { fm, basename: `(${WORD[v.repeat]}) ${name}` };
    }
  }
}
function baseFields(v) {
  var _a, _b, _c;
  const fm = { title: v.title.trim() };
  if (v.allDay) fm.allDay = true;
  else {
    fm.allDay = false;
    fm.startTime = minutesToHHMM(v.startTime);
    if (v.endTime != null) fm.endTime = minutesToHHMM(v.endTime);
  }
  const loc = ((_a = v.location) != null ? _a : "").trim();
  if (loc) fm.location = loc.slice(0, 300);
  const url = ((_b = v.url) != null ? _b : "").trim();
  if (url) fm.url = url.slice(0, 500);
  const alerts = [...new Set((_c = v.alerts) != null ? _c : [])].sort((a, b) => b - a).slice(0, MAX_ALERTS);
  if (alerts.length === 1) fm.alert = alerts[0];
  else if (alerts.length > 1) fm.alert = alerts;
  return fm;
}
function seriesFrontmatter(raw, v, dayDelta, opaque = false) {
  var _a, _b, _c;
  const fm = baseFields(v);
  const name = opaque ? randomCode() : safeName(v.title);
  const shift = (k) => k ? addDays(k, dayDelta) : void 0;
  const shiftDow = (d) => ((d + dayDelta) % 7 + 7) % 7;
  const skips = ((_a = raw.skipDates) != null ? _a : []).map((k) => addDays(k, dayDelta));
  const origUntil = repeatOf(raw).until;
  const untilFor = (orig) => v.repeatUntil == null ? null : v.repeatUntil === origUntil && orig ? addDays(orig, dayDelta) : v.repeatUntil;
  if (raw.type === "recurring") {
    fm.type = "recurring";
    fm.daysOfWeek = raw.daysOfWeek.map((d) => WEEKDAY_LETTERS[shiftDow(d)]);
    const sr = shift(raw.startRecur);
    if (sr) fm.startRecur = sr;
    const er = untilFor(raw.endRecur);
    if (er) fm.endRecur = er;
    if (skips.length) fm.skipDates = skips;
    return { fm, basename: `(Every ${fm.daysOfWeek.join(",")}) ${name}` };
  }
  if (raw.type === "rrule") {
    const r = parseRRule(raw.rrule);
    if (!r) return null;
    const parts = [`FREQ=${r.freq}`];
    if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
    if ((_b = r.byDay) == null ? void 0 : _b.length) parts.push(`BYDAY=${r.byDay.map((d) => BYDAY2[shiftDow(d)]).join(",")}`);
    if ((_c = r.byMonthDay) == null ? void 0 : _c.length) {
      if (dayDelta !== 0) {
        const moved = r.byMonthDay.map((d) => d + dayDelta);
        if (r.byMonthDay.some((d) => d < 0) || moved.some((d) => d < 1 || d > 28)) return null;
        parts.push(`BYMONTHDAY=${moved.join(",")}`);
      } else parts.push(`BYMONTHDAY=${r.byMonthDay.join(",")}`);
    }
    if (r.count != null && !isNaN(r.count)) parts.push(`COUNT=${r.count}`);
    else {
      const until = untilFor(r.until);
      if (until) parts.push(`UNTIL=${until.replace(/-/g, "")}`);
    }
    fm.type = "rrule";
    fm.startDate = addDays(raw.startDate, dayDelta);
    fm.rrule = "RRULE:" + parts.join(";");
    fm.skipDates = skips;
    return { fm, basename: `(${describeRRule(fm.rrule)}) ${name}` };
  }
  return null;
}
function randomCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
function safeName(s) {
  const cleaned = s.replace(/[\\/:*?"<>|#^[\]\x00-\x1f\x7f]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 120).trim();
  return cleaned || "Untitled event";
}
function renderNoCalendars(parent, app, store, onCreated) {
  const root = store.rootFolder();
  const box = parent.createDiv({ cls: "orc-empty orc-setup" });
  box.createDiv({ text: `No calendars yet. Each sub-folder inside "${root}" is one calendar, and every note in a sub-folder is one event.` });
  box.createDiv({ cls: "orc-muted", text: `Folder: ${root}/ \u2014 change it in Settings \u2192 Syncthing Calendar.` });
  const btn = box.createEl("button", { text: "New calendar\u2026", cls: "mod-cta" });
  btn.addEventListener("click", () => new CalendarModal(app, store, null, onCreated).open());
}
var SWATCHES = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#5AC8FA", "#AF52DE", "#FF2D55", "#A2845E", "#8E8E93"];
var HEX = /^#[0-9a-f]{6}$/i;
var CalendarModal = class extends import_obsidian.Modal {
  constructor(app, store, existing, onDone, suggestedColor = "#007AFF", kind = "calendar") {
    var _a, _b;
    super(app);
    this.store = store;
    this.existing = existing;
    this.onDone = onDone;
    this.kind = kind;
    this.name = (_a = existing == null ? void 0 : existing.name) != null ? _a : "";
    this.color = (_b = existing == null ? void 0 : existing.color) != null ? _b : suggestedColor;
  }
  get ops() {
    const s = this.store;
    return this.kind === "list" ? { noun: "list", items: "reminder", root: s.remindersFolder(), all: s.getLists(), create: s.createList, rename: s.renameList, color: s.setListColor, del: s.deleteList, contents: s.listContents } : { noun: "calendar", items: "event", root: s.rootFolder(), all: s.getCalendars(), create: s.createCalendar, rename: s.renameCalendar, color: s.setCalendarColor, del: s.deleteCalendar, contents: s.folderContents };
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    const o = this.ops;
    const Noun = o.noun[0].toUpperCase() + o.noun.slice(1);
    contentEl.createEl("h3", { text: this.existing ? `${Noun} info` : `New ${o.noun}` });
    if (!this.existing) contentEl.createDiv({ cls: "orc-muted", text: `Creates the folder ${o.root}/<name>. ${o.items[0].toUpperCase() + o.items.slice(1)}s you add to this ${o.noun} become notes inside it.` });
    new import_obsidian.Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder(this.kind === "list" ? "Groceries, Errands, Work\u2026" : "Work, Family, Health\u2026").setValue(this.name).onChange((v) => this.name = v);
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });
      if (!import_obsidian.Platform.isMobile) window.setTimeout(() => t.inputEl.focus(), 50);
    });
    const colorRow = new import_obsidian.Setting(contentEl).setName("Color");
    const swatches = colorRow.settingEl.createDiv({ cls: "orc-swatches" });
    const paint = () => swatches.querySelectorAll(".orc-swatch").forEach((el) => el.toggleClass("is-on", el.getAttribute("data-color").toLowerCase() === this.color.toLowerCase()));
    for (const c of SWATCHES) {
      const sw = swatches.createDiv({ cls: "orc-swatch", attr: { "data-color": c, "aria-label": c } });
      sw.style.background = c;
      sw.addEventListener("click", () => {
        this.color = c;
        paint();
      });
    }
    colorRow.addColorPicker((p) => p.setValue(this.color).onChange((v) => {
      if (HEX.test(v)) {
        this.color = v;
        paint();
      }
    }));
    paint();
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    if (this.existing) {
      const { events: n, other } = o.contents(this.existing.name);
      btns.createEl("button", { text: `Delete ${o.noun}`, cls: "mod-warning orc-left" }).addEventListener("click", () => {
        const ex = this.existing;
        this.close();
        if (other > 0) {
          new import_obsidian.Notice(`"${ex.name}" also holds ${other} file${other === 1 ? "" : "s"} that ${other === 1 ? `isn't a ${o.items}` : `aren't ${o.items}s`}. Move ${other === 1 ? "it" : "them"} out first, or delete the folder yourself.`, 8e3);
          return;
        }
        new ConfirmModal(this.app, `Delete "${ex.name}"?`, `The folder and its ${n} ${o.items} note${n === 1 ? "" : "s"} go to the trash chosen in Obsidian's 'Deleted files' setting.`, async () => {
          var _a;
          try {
            await o.del(ex.name);
            this.onDone();
          } catch (e) {
            new import_obsidian.Notice(((_a = e.message) == null ? void 0 : _a.startsWith("SC:")) ? e.message.slice(3) : `Could not delete the ${o.noun}.`);
          }
        }, `Delete ${o.noun}`).open();
      });
    }
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btns.createEl("button", { text: this.existing ? "Save" : "Create", cls: "mod-cta" }).addEventListener("click", () => void this.save());
  }
  async save() {
    const name = safeFolderName(this.name);
    const o = this.ops;
    if (!name) {
      new import_obsidian.Notice(`Give the ${o.noun} a name.`);
      return;
    }
    const clash = o.all.some((c) => {
      var _a;
      return c.name.toLowerCase() === name.toLowerCase() && c.name !== ((_a = this.existing) == null ? void 0 : _a.name);
    });
    if (clash) {
      new import_obsidian.Notice(`"${name}" already exists.`);
      return;
    }
    try {
      if (!this.existing) {
        await o.create(name, this.color);
        new import_obsidian.Notice(`${o.noun[0].toUpperCase() + o.noun.slice(1)} "${name}" created`);
      } else {
        if (name !== this.existing.name) await o.rename(this.existing.name, name);
        await o.color(name, this.color);
      }
      this.close();
      this.onDone();
    } catch (e) {
      new import_obsidian.Notice(`Could not save the ${o.noun}.`);
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
function safeFolderName(s) {
  return s.replace(/[\\/:*?"<>|#^[\]\x00-\x1f\x7f]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 60).trim();
}
var SearchModal = class extends import_obsidian.Modal {
  constructor(app, store, onPick) {
    super(app);
    this.store = store;
    this.onPick = onPick;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    contentEl.createEl("h3", { text: "Search events" });
    const input = contentEl.createEl("input", { cls: "orc-search-input", attr: { type: "search", placeholder: "Title, location or calendar" } });
    const list = contentEl.createDiv({ cls: "orc-search-results" });
    const today = todayKey();
    const from = addDays(today, -365), to = addDays(today, 730);
    let timer = null;
    const run = () => {
      list.empty();
      const q = input.value.trim().toLowerCase().slice(0, 100);
      if (q.length < 1) {
        list.createDiv({ cls: "orc-muted", text: "Searches one year back and two years ahead." });
        return;
      }
      const res = this.store.searchInstances(q, from, to);
      const hits = res.items;
      const upcoming = hits.filter((i) => cmpKey(i.date, today) >= 0);
      const past = hits.filter((i) => cmpKey(i.date, today) < 0).reverse();
      const shown = [...upcoming, ...past].slice(0, 100);
      if (!shown.length) {
        list.createDiv({ cls: "orc-muted", text: "No matching events." });
        return;
      }
      for (const i of shown) {
        const row = list.createDiv({ cls: "orc-listrow" });
        const p = keyParts(i.date);
        row.createDiv({ cls: "orc-listtime", text: `${MONTH_SHORT[p.m - 1]} ${p.d}${p.y !== keyParts(today).y ? ", " + p.y : ""}` });
        const bar = row.createDiv({ cls: "orc-listbar" });
        bar.style.background = i.calendar.color;
        const txt = row.createDiv({ cls: "orc-listtext" });
        txt.createDiv({ cls: "orc-listtitle", text: i.title });
        txt.createDiv({ cls: "orc-muted", text: `${i.allDay ? "all-day" : formatTime(i.start, this.store.hour12())} \xB7 ${i.calendar.name}` });
        row.addEventListener("click", () => {
          this.close();
          this.onPick(i.date);
        });
      }
      if (hits.length > shown.length || res.truncated) list.createDiv({ cls: "orc-muted", text: "More matches not shown \u2014 refine the search." });
    };
    input.addEventListener("input", () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(run, 120);
    });
    run();
    if (!import_obsidian.Platform.isMobile) window.setTimeout(() => input.focus(), 50);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ImportModal = class _ImportModal extends import_obsidian.Modal {
  constructor(app, store, onDone) {
    var _a, _b;
    super(app);
    this.store = store;
    this.onDone = onDone;
    this.events = [];
    this.calendar = (_b = (_a = store.getCalendars()[0]) == null ? void 0 : _a.name) != null ? _b : "";
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    contentEl.createEl("h3", { text: "Import .ics" });
    contentEl.createDiv({ cls: "orc-muted", text: "Reads a calendar file from this device and creates one note per event. Nothing is uploaded." });
    const cals = this.store.getCalendars();
    if (!cals.length) {
      renderNoCalendars(contentEl, this.app, this.store, () => {
        this.close();
        new _ImportModal(this.app, this.store, this.onDone).open();
      });
      return;
    }
    new import_obsidian.Setting(contentEl).setName("Into calendar").addDropdown((d) => {
      for (const c of cals) d.addOption(c.name, c.name);
      d.setValue(this.calendar).onChange((x) => this.calendar = x);
    });
    const status = contentEl.createDiv({ cls: "orc-import-status orc-muted", text: "No file chosen." });
    const input = contentEl.createEl("input", { attr: { type: "file", accept: ".ics,text/calendar" } });
    input.style.display = "none";
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Choose file\u2026" }).addEventListener("click", () => input.click());
    const go = btns.createEl("button", { text: "Import", cls: "mod-cta" });
    go.setAttribute("disabled", "true");
    input.addEventListener("change", async () => {
      var _a;
      const f = (_a = input.files) == null ? void 0 : _a[0];
      if (!f) return;
      if (f.size > MAX_ICS_BYTES) {
        status.setText("That file is larger than 5 MB.");
        return;
      }
      try {
        const res = parseICS(await f.text());
        this.events = res.events;
        status.setText(`${res.events.length} event${res.events.length === 1 ? "" : "s"} found` + (res.skipped ? `, ${res.skipped} skipped (unsupported repeat rules or missing dates)` : "") + ".");
        if (res.events.length) go.removeAttribute("disabled");
        else go.setAttribute("disabled", "true");
      } catch (e) {
        status.setText(e.message || "Could not read that file.");
      }
    });
    go.addEventListener("click", async () => {
      go.setAttribute("disabled", "true");
      try {
        const r = await this.store.importEvents(this.events, this.calendar);
        new import_obsidian.Notice(`Imported ${r.created} event${r.created === 1 ? "" : "s"}` + (r.duplicates ? ` (${r.duplicates} already there)` : ""));
        this.close();
        this.onDone();
      } catch (e) {
        new import_obsidian.Notice("Import failed.");
        go.removeAttribute("disabled");
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ExportModal = class extends import_obsidian.Modal {
  constructor(app, store) {
    super(app);
    this.store = store;
    this.choice = "__all__";
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    contentEl.createEl("h3", { text: "Export .ics" });
    contentEl.createDiv({ cls: "orc-muted", text: 'Writes a standard calendar file into the "Calendar exports" folder of your vault (so it syncs like any note). Open or AirDrop it to import into Apple Calendar, Google Calendar, Outlook or any other calendar app. Note text is included as the event description; "All calendars" includes hidden ones.' });
    new import_obsidian.Setting(contentEl).setName("Calendar").addDropdown((d) => {
      d.addOption("__all__", "All calendars");
      for (const c of this.store.getCalendars()) d.addOption(c.name, c.name);
      d.setValue(this.choice).onChange((x) => this.choice = x);
    });
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btns.createEl("button", { text: "Export", cls: "mod-cta" }).addEventListener("click", async () => {
      try {
        const path = await this.store.exportCalendars(this.choice === "__all__" ? null : [this.choice]);
        new import_obsidian.Notice(`Exported to ${path}`, 8e3);
        this.close();
      } catch (e) {
        new import_obsidian.Notice("Export failed.");
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConflictsModal = class extends import_obsidian.Modal {
  constructor(app, files, onPick) {
    super(app);
    this.files = files;
    this.onPick = onPick;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    contentEl.createEl("h3", { text: "Sync conflicts" });
    contentEl.createDiv({ cls: "orc-muted", text: "These events were changed on two devices before they synced, so Syncthing kept both versions. The calendar shows the main note; the copies below are hidden. Open each, keep what you want in the main note, then delete the copy." });
    const list = contentEl.createDiv({ cls: "orc-search-results" });
    for (const f of this.files.slice(0, 200)) {
      const row = list.createDiv({ cls: "orc-listrow" });
      const txt = row.createDiv({ cls: "orc-listtext" });
      txt.createDiv({ cls: "orc-listtitle", text: f.basename.replace(/\.sync-conflict-\d{8}-\d{6}-\w+$/, "") });
      txt.createDiv({ cls: "orc-muted", text: f.path });
      row.addEventListener("click", () => {
        this.close();
        this.onPick(f);
      });
    }
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
};
function alertHint() {
  return import_obsidian.Platform.isMobile ? "Pops up in Obsidian while it's open on screen. iPhone can't alert when Obsidian is closed." : "Mac notification + popup while Obsidian is running (window can be in the background).";
}
function kindToggle(parent, current, onSwitch) {
  const seg = parent.createDiv({ cls: "orc-kind-toggle" });
  for (const k of ["event", "reminder"]) {
    const b = seg.createDiv({ cls: "orc-kind-btn", text: k === "event" ? "Event" : "Reminder" });
    b.toggleClass("is-active", k === current);
    if (k !== current) b.addEventListener("click", onSwitch);
  }
}
var RREPEAT_LABELS = {
  none: "Never",
  daily: "Every day",
  weekdays: "Every weekday (Mon\u2013Fri)",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year"
};
var ReminderFormModal = class extends import_obsidian.Modal {
  constructor(app, store, init) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    super(app);
    this.store = store;
    this.init = init;
    this.saved = false;
    this.originalBody = null;
    this.raw = (_a = init.raw) != null ? _a : null;
    const r = this.raw;
    this.v = r ? { title: r.title, list: r.calendar.name, due: (_b = r.date) != null ? _b : null, dueTime: r.startTime, repeat: (_c = r.reminderRepeat) != null ? _c : "none", flagged: !!r.flagged, priority: (_d = r.priority) != null ? _d : "none", url: (_e = r.url) != null ? _e : "", notes: null } : { title: (_f = init.title) != null ? _f : "", list: (_g = init.list) != null ? _g : store.defaultList(), due: (_h = init.due) != null ? _h : null, dueTime: (_i = init.dueTime) != null ? _i : null, repeat: "none", flagged: !!init.flagged, priority: "none", url: "", notes: "" };
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    modalEl.addClass("orc-form");
    contentEl.empty();
    if (!this.raw) {
      kindToggle(contentEl, "reminder", () => {
        var _a, _b, _c, _d, _e;
        this.saved = true;
        this.close();
        const e = (_a = this.init.eventInit) != null ? _a : {};
        new EventFormModal(this.app, this.store, { ...e, date: (_c = (_b = this.v.due) != null ? _b : e.date) != null ? _c : todayKey(), startMinutes: (_e = (_d = this.v.dueTime) != null ? _d : e.startMinutes) != null ? _e : null, onCancel: this.init.onCancel }).open();
      });
    }
    contentEl.createEl("h3", { text: this.raw ? "Edit reminder" : "New reminder" });
    const lists = this.store.getLists();
    new import_obsidian.Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("New Reminder").setValue(this.v.title).onChange((x) => this.v.title = x);
      t.inputEl.addClass("orc-wide");
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });
      if (!import_obsidian.Platform.isMobile) window.setTimeout(() => t.inputEl.focus(), 50);
    });
    const notesWrap = contentEl.createDiv({ cls: "orc-notes" });
    notesWrap.createDiv({ cls: "setting-item-name", text: "Notes" });
    const notes = notesWrap.createEl("textarea", { cls: "orc-notes-input", attr: { rows: 3, placeholder: "Notes" } });
    notes.addEventListener("input", () => this.v.notes = notes.value);
    if (this.raw) {
      notes.setAttribute("disabled", "true");
      void this.store.readBody(this.raw).then((b) => {
        this.originalBody = b;
        notes.value = b;
        notes.removeAttribute("disabled");
      });
    }
    let dateInput = null;
    let timeInput = null;
    const dateRow = new import_obsidian.Setting(contentEl).setName("Date").addToggle((t) => t.setValue(!!this.v.due).onChange((on) => {
      var _a, _b;
      this.v.due = on ? (_a = this.v.due) != null ? _a : todayKey() : null;
      if (!on) {
        this.v.dueTime = null;
        this.v.repeat = "none";
      }
      if (dateInput) dateInput.value = (_b = this.v.due) != null ? _b : "";
      show();
    })).addText((t) => {
      var _a;
      t.inputEl.type = "date";
      dateInput = t.inputEl;
      t.setValue((_a = this.v.due) != null ? _a : "").onChange((x) => {
        this.v.due = /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : this.v.due;
      });
    });
    const timeRow = new import_obsidian.Setting(contentEl).setName("Time").addToggle((t) => t.setValue(this.v.dueTime != null).onChange((on) => {
      var _a;
      this.v.dueTime = on ? (_a = this.v.dueTime) != null ? _a : 9 * 60 : null;
      if (timeInput) timeInput.value = this.v.dueTime != null ? minutesToHHMM(this.v.dueTime) : "";
      show();
    })).addText((t) => {
      t.inputEl.type = "time";
      timeInput = t.inputEl;
      t.setValue(this.v.dueTime != null ? minutesToHHMM(this.v.dueTime) : "").onChange((x) => {
        const m = parseTime(x);
        if (m != null) this.v.dueTime = Math.min(m, 1439);
      });
    });
    const repeatRow = new import_obsidian.Setting(contentEl).setName("Repeat").addDropdown((d) => {
      for (const r of REMINDER_REPEATS) d.addOption(r, RREPEAT_LABELS[r]);
      d.setValue(this.v.repeat).onChange((x) => this.v.repeat = x);
    });
    const show = () => {
      if (dateInput) dateInput.style.display = this.v.due ? "" : "none";
      if (timeInput) timeInput.style.display = this.v.dueTime != null ? "" : "none";
      timeRow.settingEl.style.display = this.v.due ? "" : "none";
      repeatRow.settingEl.style.display = this.v.due ? "" : "none";
    };
    show();
    void dateRow;
    new import_obsidian.Setting(contentEl).setName("Flag").addToggle((t) => t.setValue(this.v.flagged).onChange((x) => this.v.flagged = x));
    new import_obsidian.Setting(contentEl).setName("Priority").addDropdown((d) => {
      d.addOptions({ none: "None", low: "Low (!)", medium: "Medium (!!)", high: "High (!!!)" });
      d.setValue(this.v.priority).onChange((x) => this.v.priority = x);
    });
    const listRow = new import_obsidian.Setting(contentEl).setName("List").addDropdown((d) => {
      var _a, _b;
      if (!lists.length) d.addOption("Reminders", "Reminders (new)");
      for (const l of lists) d.addOption(l.name, l.name);
      d.setValue(lists.some((l) => l.name === this.v.list) ? this.v.list : (_b = (_a = lists[0]) == null ? void 0 : _a.name) != null ? _b : "Reminders").onChange((x) => {
        this.v.list = x;
        paint();
      });
      this.v.list = d.getValue();
    });
    const dot = createDot(listRow.settingEl);
    const paint = () => {
      var _a, _b;
      dot.style.background = (_b = (_a = lists.find((l) => l.name === this.v.list)) == null ? void 0 : _a.color) != null ? _b : "#007AFF";
    };
    paint();
    new import_obsidian.Setting(contentEl).setName("URL").addText((t) => {
      var _a;
      t.setPlaceholder("Optional").setValue((_a = this.v.url) != null ? _a : "").onChange((x) => this.v.url = x);
      t.inputEl.addClass("orc-wide");
    });
    contentEl.createDiv({ cls: "orc-muted", text: this.v.due ? "Alerts at its date and time (date only: 9 AM) while Obsidian is running." : "No date: it stays in its list and doesn't appear on the calendar." });
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btns.createEl("button", { text: this.raw ? "Save" : "Add", cls: "mod-cta" }).addEventListener("click", () => void this.save());
  }
  async save() {
    const v = this.v;
    if (!v.title.trim()) {
      new import_obsidian.Notice("Give the reminder a title.");
      return;
    }
    if (v.url && !/^https?:\/\/\S+$/i.test(v.url.trim())) {
      new import_obsidian.Notice("URL must start with http:// or https://");
      return;
    }
    if (!v.due) {
      v.dueTime = null;
      v.repeat = "none";
    }
    if (this.raw && v.notes != null && v.notes === this.originalBody) v.notes = null;
    try {
      if (this.raw) await this.store.updateReminder(this.raw, v);
      else await this.store.createReminder(v);
      this.saved = true;
      this.close();
    } catch (e) {
      new import_obsidian.Notice("Could not save the reminder.");
    }
  }
  onClose() {
    this.contentEl.empty();
    if (!this.saved && this.init.onCancel) this.init.onCancel();
  }
};
var ReminderDetailsModal = class extends import_obsidian.Modal {
  constructor(app, r, store) {
    super(app);
    this.r = r;
    this.store = store;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    const r = this.r;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    const head = contentEl.createDiv({ cls: "orc-detail-head" });
    const check = head.createDiv({ cls: "orc-rcheck" });
    check.style.setProperty("--cal", r.calendar.color);
    check.toggleClass("is-done", !!r.completed);
    check.addEventListener("click", async () => {
      this.close();
      try {
        await this.store.toggleReminder(r);
      } catch (e) {
        new import_obsidian.Notice("Could not update the reminder.");
      }
    });
    const t = head.createDiv();
    t.createDiv({ cls: "orc-detail-title", text: r.title + (r.priority && r.priority !== "none" ? "  " + PRIORITY_MARK[r.priority] : "") });
    t.createDiv({ cls: "orc-muted", text: `${r.calendar.name} \xB7 Reminder${r.flagged ? " \xB7 \u2691 Flagged" : ""}` });
    const when = contentEl.createDiv({ cls: "orc-detail-when" });
    const due = dueLabel(r, (m) => formatTime(m, this.store.hour12()));
    when.createDiv({ text: due || "No date" });
    if (r.reminderRepeat && r.reminderRepeat !== "none") when.createDiv({ cls: "orc-muted", text: "Repeats: " + RREPEAT_LABELS[r.reminderRepeat] });
    if (r.completed) when.createDiv({ cls: "orc-muted", text: "Completed " + String(r.completed).replace("T", " ") });
    if (r.url) when.createDiv({ cls: "orc-muted orc-selectable", text: r.url });
    const notes = contentEl.createDiv({ cls: "orc-detail-notes orc-selectable" });
    void this.store.readBody(r).then((b) => {
      const x = b.trim();
      if (x) notes.setText(x.slice(0, 2e3));
    });
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: r.completed ? "Mark as not done" : "Mark as done" }).addEventListener("click", async () => {
      this.close();
      try {
        await this.store.toggleReminder(r);
      } catch (e) {
        new import_obsidian.Notice("Could not update the reminder.");
      }
    });
    btns.createEl("button", { text: "Open note" }).addEventListener("click", () => {
      this.close();
      void this.store.openNote(r);
    });
    btns.createEl("button", { text: "Delete", cls: "mod-warning" }).addEventListener("click", () => {
      this.close();
      new ConfirmModal(this.app, `Delete "${r.title}"?`, "The note goes to the trash chosen in Obsidian's 'Deleted files' setting.", async () => {
        try {
          await this.store.deleteEvent(r);
        } catch (e) {
          new import_obsidian.Notice("Could not delete the reminder.");
        }
      }).open();
    });
    btns.createEl("button", { text: "Edit", cls: "mod-cta" }).addEventListener("click", () => {
      this.close();
      new ReminderFormModal(this.app, this.store, { raw: r }).open();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var HEX2 = /^#[0-9a-f]{6}$/i;
var VIEWS = ["year", "month", "week", "day", "reminders"];
var SCHEMA_KEYS = ["title", "allDay", "startTime", "endTime", "type", "date", "endDate", "daysOfWeek", "startRecur", "endRecur", "startDate", "rrule", "skipDates", "location", "url", "alert"];
var EXPORT_FOLDER = "Calendar exports";
var DEFAULT_SETTINGS = {
  rootFolder: "Calendar",
  colors: {},
  hidden: [],
  weekStart: 0,
  hour12: true,
  hourHeight: 52,
  defaultView: "month",
  opaqueNames: false,
  defaultCalendar: "",
  renameOnChange: false,
  monthStyle: "list",
  systemNotifications: true,
  remindersFolder: "Reminders",
  listColors: {},
  hiddenLists: [],
  defaultList: ""
};
var VIEW_TYPE = "syncthing-calendar-view";
var REMINDER_PALETTE = ["#007AFF", "#FF9500", "#FF3B30", "#34C759", "#AF52DE", "#FF2D55", "#5AC8FA", "#A2845E"];
var LEGACY_ID = "orchard-calendar";
var SyncthingCalendarPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.rawEvents = [];
    this.calendars = [];
    this.dirty = true;
    this.uis = /* @__PURE__ */ new Set();
    this.refreshTimer = null;
    this.sessionView = null;
    // remembered for this session only, never written to disk
    this.firedAlerts = /* @__PURE__ */ new Set();
    this.conflicts = [];
    this.lists = [];
    this.reminders = [];
    // ---------- event store ----------
    this.store = {
      getCalendars: () => this.getCalendars(),
      getInstances: (a, b) => this.getInstances(a, b),
      rootFolder: () => this.rootPath(),
      hour12: () => this.settings.hour12,
      countEvents: (name) => {
        this.getCalendars();
        return this.rawEvents.filter((r) => r.calendar.name === name).length;
      },
      folderContents: (name) => {
        const folder = this.app.vault.getAbstractFileByPath(`${this.rootPath()}/${name}`);
        this.getCalendars();
        const eventPaths = new Set(this.rawEvents.filter((r) => r.calendar.name === name).map((r) => r.file instanceof import_obsidian2.TFile ? r.file.path : r.path));
        let events = 0, other = 0;
        const walk = (n) => {
          if (n instanceof import_obsidian2.TFolder) n.children.forEach(walk);
          else if (eventPaths.has(n.path)) events++;
          else other++;
        };
        if (folder) walk(folder);
        return { events, other };
      },
      searchInstances: (query, from, to) => {
        this.getCalendars();
        const q = query.trim().toLowerCase();
        const hidden = new Set(this.settings.hidden);
        const hits = this.rawEvents.filter((r) => {
          var _a;
          return !hidden.has(r.calendar.name) && (r.title.toLowerCase().includes(q) || ((_a = r.location) != null ? _a : "").toLowerCase().includes(q) || r.calendar.name.toLowerCase().includes(q));
        });
        const out = [];
        for (const r of hits) {
          for (const i of expandEvents([r], from, to)) {
            out.push(i);
            if (out.length >= 5e3) return { items: out, truncated: true };
          }
        }
        return { items: out, truncated: false };
      },
      createCalendar: async (name, color) => {
        const root = this.rootPath();
        if (!this.app.vault.getAbstractFileByPath(root)) await this.app.vault.createFolder(root);
        const sub = `${root}/${name}`;
        if (!this.app.vault.getAbstractFileByPath(sub)) await this.app.vault.createFolder(sub);
        if (HEX2.test(color)) this.settings.colors[name] = color;
        await this.saveSettings();
        this.scheduleRefresh();
      },
      renameCalendar: async (oldName, newName) => {
        const root = this.rootPath();
        const folder = this.app.vault.getAbstractFileByPath(`${root}/${oldName}`);
        if (!(folder instanceof import_obsidian2.TFolder)) throw new Error("Calendar not found");
        await this.app.fileManager.renameFile(folder, `${root}/${newName}`);
        if (Object.prototype.hasOwnProperty.call(this.settings.colors, oldName)) {
          this.settings.colors[newName] = this.settings.colors[oldName];
          delete this.settings.colors[oldName];
        }
        this.settings.hidden = this.settings.hidden.map((h) => h === oldName ? newName : h);
        if (this.settings.defaultCalendar === oldName) this.settings.defaultCalendar = newName;
        await this.saveSettings();
        this.scheduleRefresh();
      },
      setCalendarColor: async (name, color) => {
        if (!HEX2.test(color)) return;
        this.settings.colors[name] = color;
        await this.saveSettings();
        this.rerenderAll();
      },
      deleteCalendar: async (name) => {
        const folder = this.app.vault.getAbstractFileByPath(`${this.rootPath()}/${name}`);
        if (!(folder instanceof import_obsidian2.TFolder)) throw new Error("Calendar not found");
        if (this.store.folderContents(name).other > 0) throw new Error("SC:This folder also holds files that aren't events. Move them out first, or delete the folder yourself.");
        await this.trash(folder);
        delete this.settings.colors[name];
        this.settings.hidden = this.settings.hidden.filter((h) => h !== name);
        if (this.settings.defaultCalendar === name) this.settings.defaultCalendar = "";
        await this.saveSettings();
        this.scheduleRefresh();
      },
      createEvent: async (v) => {
        var _a;
        const cal = this.getCalendars().find((c) => c.name === v.calendar);
        if (!cal) throw new Error("Calendar not found");
        const { fm, basename } = frontmatterFor(v, void 0, this.settings.opaqueNames);
        await this.createNote(cal, fm, basename, (_a = v.notes) != null ? _a : "");
        this.scheduleRefresh();
      },
      updateEvent: async (raw, v, instanceDate) => {
        const file = this.liveFile(raw);
        if (!file) throw new Error("Note not found");
        const cal = this.getCalendars().find((c) => c.name === v.calendar);
        if (!cal) throw new Error("Calendar not found");
        let res;
        if (raw.type !== "single" && instanceDate && repeatOf(raw).repeat === v.repeat) {
          res = seriesFrontmatter(raw, v, diffDays(instanceDate, v.date), this.settings.opaqueNames);
          if (!res) throw new Error("SC:This repeat rule can't be moved by days. Use 'This event only', or edit the rule in the note.");
        } else {
          res = frontmatterFor(v, raw, this.settings.opaqueNames);
        }
        await this.writeFrontmatter(file, res.fm);
        if (v.notes != null) await this.writeBody(file, v.notes);
        await this.placeNote(file, cal, res.basename);
        this.scheduleRefresh();
      },
      updateOccurrence: async (raw, instanceDate, v) => {
        var _a;
        const cal = this.getCalendars().find((c) => c.name === v.calendar);
        if (!cal) throw new Error("Calendar not found");
        const file = this.liveFile(raw);
        if (!file) throw new Error("Note not found");
        const body = (_a = v.notes) != null ? _a : await this.readBody(file);
        const { fm, basename } = frontmatterFor({ ...v, repeat: "none", repeatUntil: null }, void 0, this.settings.opaqueNames);
        await this.createNote(cal, fm, basename, body);
        await this.addSkipDate(raw, instanceDate);
        this.scheduleRefresh();
      },
      deleteEvent: async (raw) => {
        const file = this.liveFile(raw);
        if (!file) throw new Error("Note not found");
        await this.trash(file);
        this.scheduleRefresh();
      },
      deleteOccurrence: async (raw, date) => {
        await this.addSkipDate(raw, date);
        this.scheduleRefresh();
      },
      duplicateEvent: async (raw) => {
        var _a;
        const file = this.liveFile(raw);
        if (!file) throw new Error("Note not found");
        const content = await this.app.vault.read(file);
        const folder = raw.calendar.path;
        const prefix = (_a = /^(\d{4}-\d{2}-\d{2}|\([^)]*\))/.exec(file.basename)) == null ? void 0 : _a[1];
        const base = this.settings.opaqueNames && prefix ? `${prefix} ${randomCode()}` : file.basename;
        const path = await this.uniquePath(folder, base);
        await this.app.vault.create(path, content);
        this.scheduleRefresh();
      },
      readBody: async (raw) => {
        const file = this.liveFile(raw);
        return file ? this.readBody(file) : "";
      },
      openNote: async (raw) => {
        const file = this.liveFile(raw);
        if (file) await this.app.workspace.getLeaf(false).openFile(file);
      },
      // ----- reminders -----
      getLists: () => this.getLists(),
      getReminders: () => this.getReminders(),
      remindersFolder: () => this.remindersPath(),
      // Like Apple: new reminders go to the chosen default list, else "Reminders", else the first list.
      defaultList: () => {
        var _a, _b, _c, _d;
        return (_d = (_c = (_b = (_a = this.getLists().find((l) => l.name === this.settings.defaultList)) != null ? _a : this.getLists().find((l) => l.name === "Reminders")) != null ? _b : this.getLists()[0]) == null ? void 0 : _c.name) != null ? _d : "";
      },
      createReminder: async (v) => {
        var _a, _b;
        let list = this.getLists().find((l) => l.name === v.list);
        if (!list) {
          await this.store.createList(v.list || "Reminders", "#007AFF");
          this.rebuild();
          list = this.getLists().find((l) => l.name === (v.list || "Reminders"));
          if (!list) throw new Error("List not found");
        }
        const fm = reminderFrontmatter(v, nowStamp());
        await this.createNote(list, fm, `${(_a = v.due) != null ? _a : todayKey()} ${safeName(v.title)}`, (_b = v.notes) != null ? _b : "");
        this.scheduleRefresh();
      },
      updateReminder: async (raw, v) => {
        var _a;
        const file = this.liveFile(raw);
        if (!file) throw new Error("Note not found");
        const list = this.getLists().find((l) => l.name === v.list);
        if (!list) throw new Error("List not found");
        const fm = reminderFrontmatter(v, (_a = raw.created) != null ? _a : nowStamp());
        delete fm.completed;
        await this.app.fileManager.processFrontMatter(file, (cur) => {
          for (const k of REMINDER_KEYS) if (k !== "completed") delete cur[k];
          Object.assign(cur, fm);
        });
        if (v.notes != null) await this.writeBody(file, v.notes);
        await this.placeNote(file, list, file.basename);
        this.scheduleRefresh();
      },
      // Done/not done. Completing a repeating reminder works like Apple: a completed copy is kept
      // for this date and the reminder itself moves on to its next date.
      toggleReminder: async (raw) => {
        var _a, _b;
        const fresh = this.freshRaw(raw);
        const file = fresh ? this.liveFile(fresh) : null;
        if (!fresh || !file) throw new Error("Note not found");
        if (fresh.completed) {
          await this.app.fileManager.processFrontMatter(file, (cur) => {
            cur.completed = false;
          });
        } else if (fresh.reminderRepeat && fresh.reminderRepeat !== "none" && fresh.date) {
          const done = nowStamp();
          const copy = reminderFrontmatter({ title: fresh.title, list: fresh.calendar.name, due: fresh.date, dueTime: fresh.startTime, repeat: "none", flagged: !!fresh.flagged, priority: (_a = fresh.priority) != null ? _a : "none", url: fresh.url }, (_b = fresh.created) != null ? _b : done);
          copy.completed = done;
          await this.createNote(fresh.calendar, copy, `${fresh.date} ${safeName(fresh.title)}`, await this.readBody(file));
          const next = nextDue(fresh.date, fresh.reminderRepeat);
          await this.app.fileManager.processFrontMatter(file, (cur) => {
            cur.due = next;
            cur.completed = false;
          });
        } else {
          await this.app.fileManager.processFrontMatter(file, (cur) => {
            cur.completed = nowStamp();
          });
        }
        this.scheduleRefresh();
      },
      clearCompleted: async (listName) => {
        const done = this.getReminders().filter((r) => r.completed && (listName == null || r.calendar.name === listName));
        for (const r of done) {
          const f = this.liveFile(r);
          if (f) await this.trash(f);
        }
        this.scheduleRefresh();
        return done.length;
      },
      createList: async (name, color) => {
        const root = this.remindersPath();
        if (!this.app.vault.getAbstractFileByPath(root)) await this.app.vault.createFolder(root);
        if (!this.app.vault.getAbstractFileByPath(`${root}/${name}`)) await this.app.vault.createFolder(`${root}/${name}`);
        if (HEX2.test(color)) this.settings.listColors[name] = color;
        await this.saveSettings();
        this.scheduleRefresh();
      },
      renameList: async (oldName, newName) => {
        const root = this.remindersPath();
        const folder = this.app.vault.getAbstractFileByPath(`${root}/${oldName}`);
        if (!(folder instanceof import_obsidian2.TFolder)) throw new Error("List not found");
        await this.app.fileManager.renameFile(folder, `${root}/${newName}`);
        if (Object.prototype.hasOwnProperty.call(this.settings.listColors, oldName)) {
          this.settings.listColors[newName] = this.settings.listColors[oldName];
          delete this.settings.listColors[oldName];
        }
        this.settings.hiddenLists = this.settings.hiddenLists.map((h) => h === oldName ? newName : h);
        if (this.settings.defaultList === oldName) this.settings.defaultList = newName;
        await this.saveSettings();
        this.scheduleRefresh();
      },
      setListColor: async (name, color) => {
        if (!HEX2.test(color)) return;
        this.settings.listColors[name] = color;
        await this.saveSettings();
        this.rerenderAll();
      },
      deleteList: async (name) => {
        const folder = this.app.vault.getAbstractFileByPath(`${this.remindersPath()}/${name}`);
        if (!(folder instanceof import_obsidian2.TFolder)) throw new Error("List not found");
        if (this.store.listContents(name).other > 0) throw new Error("SC:This folder also holds files that aren't reminders. Move them out first, or delete the folder yourself.");
        await this.trash(folder);
        delete this.settings.listColors[name];
        this.settings.hiddenLists = this.settings.hiddenLists.filter((h) => h !== name);
        await this.saveSettings();
        this.scheduleRefresh();
      },
      listContents: (name) => {
        const folder = this.app.vault.getAbstractFileByPath(`${this.remindersPath()}/${name}`);
        const paths = new Set(this.getReminders().filter((r) => r.calendar.name === name).map((r) => r.file instanceof import_obsidian2.TFile ? r.file.path : r.path));
        let events = 0, other = 0;
        const walk = (n) => {
          if (n instanceof import_obsidian2.TFolder) n.children.forEach(walk);
          else if (paths.has(n.path)) events++;
          else other++;
        };
        if (folder) walk(folder);
        return { events, other };
      },
      isListHidden: (name) => this.settings.hiddenLists.includes(name),
      setListHidden: (name, hidden) => {
        this.settings.hiddenLists = this.settings.hiddenLists.filter((x) => x !== name);
        if (hidden) this.settings.hiddenLists.push(name);
        void this.saveSettings();
        this.rerenderAll();
      },
      exportCalendars: async (names) => {
        this.getCalendars();
        const pick = names ? this.rawEvents.filter((r) => names.includes(r.calendar.name)) : this.rawEvents;
        const items = [];
        for (const raw of pick) {
          const file = this.liveFile(raw);
          items.push({ raw, notes: file ? await this.readBody(file) : "" });
        }
        const label = names && names.length === 1 ? names[0] : "All calendars";
        const text = toICS(items, label);
        if (!this.app.vault.getAbstractFileByPath(EXPORT_FOLDER)) await this.app.vault.createFolder(EXPORT_FOLDER);
        const path = `${EXPORT_FOLDER}/${safeName(label)} ${todayKey()}.ics`;
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof import_obsidian2.TFile) await this.app.vault.modify(existing, text);
        else await this.app.vault.create(path, text);
        return path;
      },
      importEvents: async (events, calendarName) => {
        var _a;
        const cal = this.getCalendars().find((c) => c.name === calendarName);
        if (!cal) throw new Error("Calendar not found");
        const seen = new Set(this.rawEvents.filter((r) => r.calendar.name === calendarName).map((r) => {
          var _a2, _b, _c;
          return dupKey(r.title, (_c = (_b = (_a2 = r.date) != null ? _a2 : r.startDate) != null ? _b : r.startRecur) != null ? _c : "", r.startTime);
        }));
        let created = 0, duplicates = 0;
        for (const e of events) {
          const k = dupKey(e.title, e.date, e.startTime);
          if (seen.has(k)) {
            duplicates++;
            continue;
          }
          seen.add(k);
          const { fm, basename } = importedFrontmatter(e, this.settings.opaqueNames);
          await this.createNote(cal, fm, basename, (_a = e.notes) != null ? _a : "");
          created++;
        }
        this.scheduleRefresh();
        return { created, duplicates };
      }
    };
  }
  // Syncthing ".sync-conflict-" copies inside the calendar folder
  async onload() {
    var _a, _b;
    this.settings = sanitizeSettings((_b = (_a = await this.loadData()) != null ? _a : await this.legacySettings()) != null ? _b : {});
    this.registerView(VIEW_TYPE, (leaf) => new CalendarView(leaf, this));
    this.addRibbonIcon("calendar", "Open Syncthing Calendar", () => void this.activateView());
    this.addCommand({ id: "open", name: "Open calendar", callback: () => void this.activateView() });
    this.addCommand({ id: "new-event", name: "New event", callback: () => this.openNewEvent({ date: todayKey() }) });
    this.addCommand({ id: "new-calendar", name: "New calendar", callback: () => this.newCalendar() });
    this.addCommand({ id: "search", name: "Search events", callback: () => this.search(null) });
    this.addCommand({ id: "import-ics", name: "Import .ics file", callback: () => new ImportModal(this.app, this.store, () => this.rerenderAll()).open() });
    this.addCommand({ id: "export-ics", name: "Export calendars as .ics", callback: () => new ExportModal(this.app, this.store).open() });
    this.addSettingTab(new CalendarSettingTab(this.app, this));
    for (const lang of ["syncthing-calendar", "orchard-calendar"]) {
      this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
        ctx.addChild(new CodeBlockChild(el, this, source));
      });
    }
    const invalidate = (file, oldPath) => {
      var _a2;
      const p = typeof file === "string" ? file : (_a2 = file == null ? void 0 : file.path) != null ? _a2 : "";
      if (this.underRoot(p) || oldPath && this.underRoot(oldPath)) this.scheduleRefresh();
    };
    this.registerEvent(this.app.metadataCache.on("changed", invalidate));
    this.registerEvent(this.app.vault.on("delete", invalidate));
    this.registerEvent(this.app.vault.on("rename", invalidate));
    this.registerEvent(this.app.vault.on("create", invalidate));
    const catchUp = () => {
      for (const ui of this.uis) ui.renderIfPending();
    };
    this.registerEvent(this.app.workspace.on("layout-change", catchUp));
    this.registerEvent(this.app.workspace.on("active-leaf-change", catchUp));
    this.app.workspace.onLayoutReady(() => this.scheduleRefresh());
    this.registerInterval(window.setInterval(() => this.checkAlerts(), 3e4));
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) this.checkAlerts();
    });
    this.app.workspace.onLayoutReady(() => this.checkAlerts());
  }
  onunload() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    for (const ui of this.uis) ui.destroy();
    this.uis.clear();
  }
  // One-time: pick up colors/folder from the plugin's earlier id so renaming loses nothing.
  async legacySettings() {
    var _a;
    try {
      const vault = this.app.vault;
      const p = `${(_a = vault.configDir) != null ? _a : ".obsidian"}/plugins/${LEGACY_ID}/data.json`;
      if (!vault.adapter || !await vault.adapter.exists(p)) return null;
      const old = JSON.parse(await vault.adapter.read(p));
      return old && typeof old === "object" ? old : null;
    } catch (e) {
      return null;
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // ---------- data ----------
  rootPath() {
    return safeRoot(this.settings.rootFolder);
  }
  // Reminders folder: must not overlap the calendar folder (one can't contain the other).
  remindersPath() {
    const cal = this.rootPath();
    let r = safeRoot(this.settings.remindersFolder);
    if (r === cal || r.startsWith(cal + "/") || cal.startsWith(r + "/")) r = cal === "Reminders" ? "Calendar Reminders" : "Reminders";
    return r;
  }
  underRoot(path) {
    const inside = (root) => !!root && (path === root || path.startsWith(root + "/"));
    return inside(this.rootPath()) || inside(this.remindersPath());
  }
  scheduleRefresh() {
    this.dirty = true;
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.rerenderAll();
    }, 150);
  }
  rerenderAll() {
    this.dirty = true;
    for (const ui of this.uis) ui.render();
  }
  rebuild() {
    var _a;
    const root = this.rootPath();
    const folder = root ? this.app.vault.getAbstractFileByPath(root) : null;
    this.calendars = [];
    this.rawEvents = [];
    this.conflicts = [];
    this.rebuildReminders();
    if (!root || !(folder instanceof import_obsidian2.TFolder)) {
      this.dirty = false;
      return;
    }
    const subs = folder.children.filter((c) => c instanceof import_obsidian2.TFolder).sort((a, b) => a.name.localeCompare(b.name));
    subs.forEach((f, i) => {
      const custom = Object.prototype.hasOwnProperty.call(this.settings.colors, f.name) ? this.settings.colors[f.name] : "";
      this.calendars.push({ name: f.name, path: f.path, color: HEX2.test(custom) ? custom : PALETTE[i % PALETTE.length] });
    });
    const names = new Set(this.calendars.map((c) => c.name));
    const staleColor = Object.keys(this.settings.colors).some((k) => !names.has(k));
    const staleHidden = this.settings.hidden.some((k) => !names.has(k));
    const staleDefault = !!this.settings.defaultCalendar && !names.has(this.settings.defaultCalendar);
    if (staleColor || staleHidden || staleDefault) {
      this.settings.colors = Object.fromEntries(Object.entries(this.settings.colors).filter(([k]) => names.has(k)));
      this.settings.hidden = this.settings.hidden.filter((k) => names.has(k));
      if (staleDefault) this.settings.defaultCalendar = "";
      void this.saveSettings();
    }
    const byPath = new Map(this.calendars.map((c) => [c.path, c]));
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(root + "/")) continue;
      if (/\.sync-conflict-\d{8}-\d{6}-/.test(file.basename)) {
        this.conflicts.push(file);
        continue;
      }
      const rel = file.path.slice(root.length + 1);
      const top = rel.split("/")[0];
      const cal = byPath.get(`${root}/${top}`);
      if (!cal || rel.indexOf("/") === -1) continue;
      const fm = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
      const ev = parseFrontmatter(fm, file.path, file.basename, cal);
      if (ev) {
        ev.file = file;
        this.rawEvents.push(ev);
      }
    }
    this.dirty = false;
  }
  rebuildReminders() {
    var _a;
    this.lists = [];
    this.reminders = [];
    const root = this.remindersPath();
    const folder = this.app.vault.getAbstractFileByPath(root);
    if (!(folder instanceof import_obsidian2.TFolder)) return;
    const subs = folder.children.filter((c) => c instanceof import_obsidian2.TFolder).sort((a, b) => a.name.localeCompare(b.name));
    subs.forEach((f, i) => {
      const custom = Object.prototype.hasOwnProperty.call(this.settings.listColors, f.name) ? this.settings.listColors[f.name] : "";
      this.lists.push({ name: f.name, path: f.path, color: HEX2.test(custom) ? custom : REMINDER_PALETTE[i % REMINDER_PALETTE.length] });
    });
    const byPath = new Map(this.lists.map((c) => [c.path, c]));
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(root + "/")) continue;
      if (/\.sync-conflict-\d{8}-\d{6}-/.test(file.basename)) {
        this.conflicts.push(file);
        continue;
      }
      const rel = file.path.slice(root.length + 1);
      const list = byPath.get(`${root}/${rel.split("/")[0]}`);
      if (!list || rel.indexOf("/") === -1) continue;
      const r = parseReminder((_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter, file.path, file.basename, list);
      if (r) {
        r.file = file;
        this.reminders.push(r);
      }
    }
  }
  getCalendars() {
    if (this.dirty) this.rebuild();
    return this.calendars;
  }
  getLists() {
    if (this.dirty) this.rebuild();
    return this.lists;
  }
  getReminders() {
    if (this.dirty) this.rebuild();
    return this.reminders;
  }
  getInstances(from, to) {
    if (this.dirty) this.rebuild();
    const hidden = new Set(this.settings.hidden);
    const hiddenLists = new Set(this.settings.hiddenLists);
    const events = this.rawEvents.filter((r) => !hidden.has(r.calendar.name));
    const rems = this.reminders.filter((r) => r.date && !hiddenLists.has(r.calendar.name)).map((r) => !r.completed && r.reminderRepeat && r.reminderRepeat !== "none" ? { ...r, type: "rrule", startDate: r.date, rrule: REMINDER_RRULE[r.reminderRepeat], skipDates: [] } : r);
    return expandEvents(events.length && rems.length ? [...events, ...rems] : events.length ? events : rems, from, to);
  }
  defaultCalendar() {
    var _a, _b;
    const cals = this.getCalendars().filter((c) => !this.settings.hidden.includes(c.name));
    const all = this.getCalendars();
    return (_b = (_a = all.find((c) => c.name === this.settings.defaultCalendar)) != null ? _a : cals[0]) != null ? _b : all[0];
  }
  // ---------- note helpers ----------
  // The note behind an event, following renames, but only while it is still inside the calendar
  // folder: a note that sync moved elsewhere is never edited, moved back, or deleted from here.
  liveFile(raw) {
    const f = raw.file instanceof import_obsidian2.TFile ? raw.file : this.app.vault.getAbstractFileByPath(raw.path);
    return f instanceof import_obsidian2.TFile && this.app.vault.getAbstractFileByPath(f.path) === f && this.underRoot(f.path) ? f : null;
  }
  // Current frontmatter of the note (sync may have changed it since the view was drawn).
  freshRaw(raw) {
    var _a, _b, _c, _d;
    const file = this.liveFile(raw);
    if (!file) return null;
    if (raw.kind === "reminder") {
      const list = (_a = this.getLists().find((c) => file.path.startsWith(c.path + "/"))) != null ? _a : raw.calendar;
      const r = parseReminder((_b = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _b.frontmatter, file.path, file.basename, list);
      if (r) r.file = file;
      return r;
    }
    const cal = (_c = this.getCalendars().find((c) => file.path.startsWith(c.path + "/"))) != null ? _c : raw.calendar;
    const ev = parseFrontmatter((_d = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _d.frontmatter, file.path, file.basename, cal);
    if (ev) ev.file = file;
    return ev;
  }
  async uniquePath(folder, basename, allow) {
    let path = `${folder}/${basename}.md`;
    let i = 2;
    while (path !== allow && this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${basename} ${i++}.md`;
    return path;
  }
  async readBody(file) {
    return splitNote(await this.app.vault.read(file)).body;
  }
  async writeBody(file, body) {
    const vault = this.app.vault;
    const swap = (t) => splitNote(t).head + body;
    if (typeof vault.process === "function") await vault.process(file, swap);
    else await this.app.vault.modify(file, swap(await this.app.vault.read(file)));
  }
  async createNote(cal, fm, basename, body = "") {
    const path = await this.uniquePath(cal.path, basename);
    await this.app.vault.create(path, `---
${toYaml(fm)}---
${body}`);
  }
  async writeFrontmatter(file, fm) {
    await this.app.fileManager.processFrontMatter(file, (cur) => {
      for (const k of SCHEMA_KEYS) delete cur[k];
      Object.assign(cur, fm);
    });
  }
  // Move the note into the target calendar folder. By default a note keeps the name it was created
  // with: renaming on every date change looks like "delete + new file" to Syncthing, and if another
  // device edits the old name before syncing, both files survive and the event shows up twice.
  // With "Rename notes when dates change" on, the date/rule prefix of plugin-made names is refreshed.
  async placeNote(file, cal, basename) {
    var _a, _b;
    const generated = /^(\d{4}-\d{2}-\d{2}|\([^)]*\)) (.+)$/.exec(file.basename);
    let newBase = file.basename;
    if (generated && this.settings.renameOnChange) {
      const prefix = (_b = (_a = /^(\d{4}-\d{2}-\d{2}|\([^)]*\))/.exec(basename)) == null ? void 0 : _a[1]) != null ? _b : generated[1];
      newBase = this.settings.opaqueNames ? `${prefix} ${generated[2]}` : basename;
    }
    const target = `${cal.path}/${newBase}.md`;
    if (target !== file.path) {
      const dest = await this.uniquePath(cal.path, newBase, file.path);
      await this.app.fileManager.renameFile(file, dest);
    }
  }
  async addSkipDate(raw, date) {
    const file = this.liveFile(raw);
    if (!file) throw new Error("Note not found");
    await this.app.fileManager.processFrontMatter(file, (cur) => {
      const list = Array.isArray(cur.skipDates) ? cur.skipDates.map(String) : [];
      if (list.length >= 4e3) throw new Error("SC:This repeating event has too many exceptions. Split it into a new series.");
      if (!list.includes(date)) list.push(date);
      cur.skipDates = list.sort();
    });
  }
  async trash(f) {
    const fmgr = this.app.fileManager;
    if (typeof fmgr.trashFile === "function") await fmgr.trashFile(f);
    else await this.app.vault.trash(f, false);
  }
  valuesFrom(raw) {
    var _a, _b;
    const rep = repeatOf(raw);
    return {
      title: raw.title,
      calendar: raw.calendar.name,
      date: raw.type === "single" ? raw.date : raw.type === "recurring" ? (_a = raw.startRecur) != null ? _a : todayKey() : raw.startDate,
      endDate: raw.type === "single" ? (_b = raw.endDate) != null ? _b : null : null,
      allDay: raw.allDay,
      startTime: raw.startTime,
      endTime: raw.endTime,
      repeat: rep.repeat,
      repeatUntil: rep.until,
      location: raw.location,
      url: raw.url,
      alerts: [...raw.alerts],
      notes: null
    };
  }
  // ---------- UI actions ----------
  openNewEvent(init) {
    var _a, _b, _c, _d;
    new EventFormModal(this.app, this.store, {
      date: init.date,
      startMinutes: (_a = init.start) != null ? _a : null,
      endMinutes: (_b = init.end) != null ? _b : null,
      allDay: init.allDay,
      endDate: (_c = init.endDate) != null ? _c : null,
      defaultCalendar: (_d = this.defaultCalendar()) == null ? void 0 : _d.name,
      onCancel: init.onCancel
    }).open();
  }
  newCalendar() {
    var _a;
    const used = new Set(this.getCalendars().map((c) => c.color.toUpperCase()));
    const suggested = (_a = SWATCHES.find((c) => !used.has(c.toUpperCase()))) != null ? _a : SWATCHES[0];
    new CalendarModal(this.app, this.store, null, () => this.rerenderAll(), suggested).open();
  }
  newList() {
    var _a;
    const used = new Set(this.getLists().map((c) => c.color.toUpperCase()));
    const suggested = (_a = REMINDER_PALETTE.find((c) => !used.has(c.toUpperCase()))) != null ? _a : REMINDER_PALETTE[0];
    new CalendarModal(this.app, this.store, null, () => this.rerenderAll(), suggested, "list").open();
  }
  search(ui) {
    new SearchModal(this.app, this.store, (date) => {
      if (ui) ui.goTo(date, "day");
      else void this.activateView().then(() => {
        for (const u of this.uis) u.goTo(date, "day");
      });
    }).open();
  }
  // Drag-and-drop result from the UI. Single events move directly; repeating events ask
  // "This event only / All events" like Apple Calendar. Cancelling redraws the original spot.
  async moveInstance(inst, change) {
    const unchanged = change.dayDelta === 0 && (change.start == null || change.start === inst.start && change.end === inst.end);
    if (unchanged) return;
    const fail = (e) => {
      var _a;
      new import_obsidian2.Notice(((_a = e == null ? void 0 : e.message) == null ? void 0 : _a.startsWith("SC:")) ? e.message.slice(3) : "Could not move the event.");
      this.rerenderAll();
    };
    const raw = this.freshRaw(inst.raw);
    const file = raw ? this.liveFile(raw) : null;
    if (!raw || !file) return fail(new Error("SC:That event's note changed or moved. Try again."));
    const timed = change.start != null && change.end != null && !inst.allDay && !raw.allDay;
    if (raw.kind === "reminder") {
      try {
        const patch = { due: addDays(raw.date, change.dayDelta) };
        if (timed) patch.dueTime = minutesToHHMM(change.start);
        await this.app.fileManager.processFrontMatter(file, (cur) => Object.assign(cur, patch));
        this.scheduleRefresh();
      } catch (e) {
        fail(e);
      }
      return;
    }
    const times = timed ? { startTime: minutesToHHMM(change.start), endTime: minutesToHHMM(change.end) } : {};
    const newDate = addDays(inst.date, change.dayDelta);
    if (raw.type === "single") {
      try {
        const patch = { ...times, date: addDays(raw.date, change.dayDelta) };
        if (raw.endDate) patch.endDate = addDays(raw.endDate, change.dayDelta);
        await this.app.fileManager.processFrontMatter(file, (cur) => Object.assign(cur, patch));
        await this.placeNote(file, raw.calendar, `${patch.date} ${safeName(raw.title)}`);
        this.scheduleRefresh();
      } catch (e) {
        fail(e);
      }
      return;
    }
    new ScopeModal(this.app, `Move "${raw.title}"`, "This is a repeating event.", "This event only", "All events", async (scope) => {
      try {
        const v = this.valuesFrom(raw);
        if (timed) {
          v.startTime = change.start;
          v.endTime = change.end;
        }
        if (scope === "this") {
          await this.store.updateOccurrence(raw, inst.date, { ...v, date: newDate, endDate: null, repeat: "none", repeatUntil: null });
          return;
        }
        const res = seriesFrontmatter(raw, { ...v, date: newDate }, change.dayDelta, this.settings.opaqueNames);
        if (!res) throw new Error("SC:This repeat rule can't be moved by days. Use 'This event only', or edit the rule in the note.");
        const RULE_KEYS = ["type", "daysOfWeek", "startRecur", "endRecur", "startDate", "rrule", "skipDates"];
        await this.app.fileManager.processFrontMatter(file, (cur) => {
          for (const k of RULE_KEYS) delete cur[k];
          for (const k of RULE_KEYS) if (res.fm[k] !== void 0) cur[k] = res.fm[k];
          Object.assign(cur, times);
        });
        await this.placeNote(file, raw.calendar, res.basename);
        this.scheduleRefresh();
      } catch (e) {
        fail(e);
      }
    }, false, () => this.rerenderAll()).open();
  }
  checkAlerts() {
    this.getCalendars();
    const hidden = new Set(this.settings.hidden);
    const withAlert = [...this.rawEvents.filter((r) => r.alerts.length && !hidden.has(r.calendar.name)), ...this.reminders.filter((r) => r.alerts.length && r.date && !r.completed)];
    if (!withAlert.length) return;
    const now = Date.now();
    const today = todayKey();
    const maxAlert = withAlert.reduce((m, r) => {
      var _a;
      return Math.max(m, (_a = r.alerts[0]) != null ? _a : 0);
    }, 0);
    const lead = Math.min(28, Math.ceil(maxAlert / 1440) + 1);
    const due = [];
    for (const inst of expandEvents(withAlert, addDays(today, -1), addDays(today, lead))) {
      for (const a of inst.raw.alerts) {
        const fire = instanceStart(inst).getTime() - a * 6e4;
        const key = `${inst.raw.path}|${inst.date}|${a}`;
        if (fire <= now && now - fire < 60 * 6e4 && !this.firedAlerts.has(key)) {
          this.firedAlerts.add(key);
          due.push({ inst, missed: now - fire > 2 * 6e4 });
        }
      }
    }
    for (const { inst, missed } of due.slice(0, 3)) {
      const when = inst.allDay ? "all day" : formatTime(inst.start, this.settings.hour12);
      const day = inst.date === today ? "today" : inst.date;
      new import_obsidian2.Notice(`${missed ? "Missed reminder" : "Reminder"}: ${inst.title} \u2014 ${day}, ${when}`, 0);
      this.systemNotify(inst.title, `${missed ? "Missed \xB7 " : ""}${day}, ${when}${inst.raw.location ? " \xB7 " + inst.raw.location : ""}`);
    }
    if (due.length > 3) new import_obsidian2.Notice(`Reminder: ${due.length - 3} more events are starting soon`, 0);
    if (this.firedAlerts.size > 2e3) this.firedAlerts.clear();
  }
  // Mac/desktop: a normal system notification (Notification Center), created locally by the app.
  // Not available on iPhone/iPad, where the Obsidian popup is the only alert.
  systemNotify(title, body) {
    if (!this.settings.systemNotifications || import_obsidian2.Platform.isMobile) return;
    const N = window.Notification;
    if (!N || N.permission === "denied") return;
    try {
      new N(title, { body, silent: false });
    } catch (e) {
    }
  }
  // ---------- UI wiring ----------
  mountUI(container, initial) {
    var _a, _b, _c;
    const state = {
      view: (_b = (_a = initial == null ? void 0 : initial.view) != null ? _a : this.sessionView) != null ? _b : this.settings.defaultView,
      cursor: clampKey((_c = initial == null ? void 0 : initial.cursor) != null ? _c : todayKey())
    };
    let ui;
    const ctx = {
      getInstances: (a, b) => this.getInstances(a, b),
      getCalendars: () => this.getCalendars(),
      isHidden: (n) => this.settings.hidden.includes(n),
      setHidden: (n, h) => {
        this.settings.hidden = this.settings.hidden.filter((x) => x !== n);
        if (h) this.settings.hidden.push(n);
        void this.saveSettings();
      },
      openEvent: (inst) => (inst.raw.kind === "reminder" ? new ReminderDetailsModal(this.app, inst.raw, this.store) : new EventDetailsModal(this.app, inst, this.store)).open(),
      monthStyle: () => this.settings.monthStyle,
      setMonthStyle: (m) => {
        this.settings.monthStyle = m;
        void this.saveSettings();
        this.rerenderAll();
      },
      getLists: () => this.getLists(),
      getReminders: () => this.getReminders(),
      isListHidden: (n) => this.settings.hiddenLists.includes(n),
      setListHidden: (n, h) => this.store.setListHidden(n, h),
      toggleReminder: (r) => {
        this.store.toggleReminder(r).catch(() => new import_obsidian2.Notice("Could not update the reminder."));
      },
      openReminder: (r) => new ReminderDetailsModal(this.app, r, this.store).open(),
      newReminder: (init) => {
        var _a2;
        return new ReminderFormModal(this.app, this.store, { list: init.list, due: (_a2 = init.due) != null ? _a2 : null, flagged: init.flagged }).open();
      },
      quickAddReminder: async (title, list, due, flagged) => {
        try {
          await this.store.createReminder({ title, list: list != null ? list : this.store.defaultList(), due, dueTime: null, repeat: "none", flagged, priority: "none", url: "", notes: "" });
        } catch (e) {
          new import_obsidian2.Notice("Could not add the reminder.");
        }
      },
      newList: () => this.newList(),
      editList: (c) => new CalendarModal(this.app, this.store, c, () => this.rerenderAll(), c.color, "list").open(),
      clearCompleted: (list) => {
        const n = this.getReminders().filter((r) => r.completed && (list == null || r.calendar.name === list)).length;
        if (!n) return;
        new ConfirmModal(this.app, `Clear ${n} completed reminder${n === 1 ? "" : "s"}?`, "The notes go to the trash chosen in Obsidian's 'Deleted files' setting.", async () => {
          try {
            await this.store.clearCompleted(list);
          } catch (e) {
            new import_obsidian2.Notice("Could not clear completed reminders.");
          }
        }, "Clear").open();
      },
      createEvent: (date, start, end, onCancel, allDay, endDate) => this.openNewEvent({ date, start, end, onCancel, allDay, endDate }),
      moveEvent: (inst, change) => void this.moveInstance(inst, change),
      newCalendarColor: () => {
        var _a2, _b2;
        return (_b2 = (_a2 = this.defaultCalendar()) == null ? void 0 : _a2.color) != null ? _b2 : "#007AFF";
      },
      conflictCount: () => {
        this.getCalendars();
        return this.conflicts.length;
      },
      showConflicts: () => {
        this.getCalendars();
        new ConflictsModal(this.app, this.conflicts, (f) => void this.app.workspace.getLeaf(false).openFile(f)).open();
      },
      version: this.manifest.version,
      renderEmpty: (el) => renderNoCalendars(el, this.app, this.store, () => this.rerenderAll()),
      newCalendar: () => this.newCalendar(),
      editCalendar: (c) => new CalendarModal(this.app, this.store, c, () => this.rerenderAll()).open(),
      search: () => this.search(ui),
      importICS: () => new ImportModal(this.app, this.store, () => this.rerenderAll()).open(),
      exportICS: () => new ExportModal(this.app, this.store).open(),
      hour12: this.settings.hour12,
      weekStart: this.settings.weekStart,
      hourHeight: this.settings.hourHeight,
      state,
      onStateChange: (s) => {
        this.sessionView = s.view;
      }
    };
    ui = new CalendarUI(container, ctx);
    this.uis.add(ui);
    return ui;
  }
  unmountUI(ui) {
    this.uis.delete(ui);
    ui.destroy();
  }
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
};
function safeRoot(v) {
  const p = (0, import_obsidian2.normalizePath)(typeof v === "string" ? v.trim() : "");
  const segs = p.split("/");
  if (!p || p === "/" || segs.some((x) => !x || x === "." || x === ".." || x.startsWith("."))) return "Calendar";
  return p;
}
function dupKey(title, date, start) {
  return `${title.trim().toLowerCase()}|${date}|${start != null ? start : "allday"}`;
}
function splitNote(text) {
  const m = /^\uFEFF?---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? { head: m[0].endsWith("\n") ? m[0] : m[0] + "\n", body: text.slice(m[0].length) } : { head: "", body: text };
}
function importedFrontmatter(e, opaque) {
  var _a, _b, _c;
  const fm = { title: e.title };
  const pad2 = (n) => String(n).padStart(2, "0");
  const hm = (m) => `${pad2(Math.floor(Math.min(m, 1439) / 60))}:${pad2(Math.min(m, 1439) % 60)}`;
  if (e.allDay) fm.allDay = true;
  else {
    fm.allDay = false;
    fm.startTime = hm(e.startTime);
    if (e.endTime != null && e.endTime > e.startTime) fm.endTime = hm(e.endTime);
  }
  if (e.location) fm.location = e.location;
  if (e.url) fm.url = e.url;
  if (e.alerts.length === 1) fm.alert = e.alerts[0];
  else if (e.alerts.length > 1) fm.alert = e.alerts;
  const name = opaque ? randomCode() : safeName(e.title);
  if (e.rrule) {
    fm.type = "rrule";
    fm.startDate = e.date;
    fm.rrule = e.rrule;
    fm.skipDates = [...new Set(e.skipDates)].sort();
    const freq = (_c = (_b = (_a = /FREQ=(\w+)/i.exec(e.rrule)) == null ? void 0 : _a[1]) == null ? void 0 : _b.toLowerCase()) != null ? _c : "custom";
    return { fm, basename: `(repeats ${freq}) ${name}` };
  }
  fm.type = "single";
  fm.date = e.date;
  if (e.endDate) fm.endDate = e.endDate;
  return { fm, basename: `${e.date} ${name}` };
}
var CalendarView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.ui = null;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Calendar";
  }
  getIcon() {
    return "calendar";
  }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("orc-view-content");
    this.ui = this.plugin.mountUI(this.contentEl);
  }
  async onClose() {
    if (this.ui) this.plugin.unmountUI(this.ui);
    this.ui = null;
  }
};
var CodeBlockChild = class extends import_obsidian2.MarkdownRenderChild {
  constructor(el, plugin, source) {
    super(el);
    this.plugin = plugin;
    this.source = source;
    this.ui = null;
  }
  onload() {
    var _a;
    const opts = parseOptions(this.source);
    this.containerEl.addClass("orc-embed");
    this.containerEl.style.height = (_a = opts.height) != null ? _a : "70vh";
    this.ui = this.plugin.mountUI(this.containerEl, { view: opts.view });
  }
  onunload() {
    if (this.ui) this.plugin.unmountUI(this.ui);
    this.ui = null;
  }
};
function parseOptions(src) {
  var _a;
  const out = {};
  for (const line of src.split(/\r?\n/).slice(0, 20)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().slice(0, 20);
    if (k === "view" && VIEWS.includes(v)) out.view = v;
    if (k === "height") {
      const m = v.match(/^(\d{2,4})(px|vh|%)?$/);
      if (m) out.height = m[1] + ((_a = m[2]) != null ? _a : "px");
    }
  }
  return out;
}
function toYaml(obj) {
  let s = "";
  for (const [k, v] of Object.entries(obj)) {
    if (v === void 0) continue;
    if (Array.isArray(v)) s += `${k}: [${v.map(yamlAtom).join(", ")}]
`;
    else s += `${k}: ${yamlAtom(v)}
`;
  }
  return s;
}
function yamlAtom(v) {
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const str = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str) || /^\d{2}:\d{2}$/.test(str)) return str;
  const plain = /^[A-Za-z][A-Za-z0-9 _.,'()!-]*$/.test(str) && !/^(true|false|null|yes|no|on|off)$/i.test(str) && !/\s$/.test(str);
  return plain ? str : JSON.stringify(str);
}
var CalendarSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const redraw = () => this.plugin.rerenderAll();
    new import_obsidian2.Setting(containerEl).setName(`Syncthing Calendar v${this.plugin.manifest.version}`).setHeading();
    new import_obsidian2.Setting(containerEl).setName("Calendar folder").setDesc("Each sub-folder inside it is one calendar; each note inside a sub-folder is one event (Full Calendar format).").addText((t) => t.setValue(s.rootFolder).setPlaceholder("Calendar").onChange(async (v) => {
      s.rootFolder = safeRoot(v);
      await this.plugin.saveSettings();
      redraw();
    }));
    new import_obsidian2.Setting(containerEl).setName("Default calendar").setDesc("Used for new events and the drag-to-create preview color.").addDropdown((d) => {
      d.addOption("", "First visible calendar");
      for (const c of this.plugin.getCalendars()) d.addOption(c.name, c.name);
      d.setValue(s.defaultCalendar).onChange(async (v) => {
        s.defaultCalendar = v;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Week starts on").addDropdown(
      (d) => d.addOptions({ "0": "Sunday", "1": "Monday" }).setValue(String(s.weekStart)).onChange(async (v) => {
        s.weekStart = v === "1" ? 1 : 0;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("12-hour clock").addToggle(
      (t) => t.setValue(s.hour12).onChange(async (v) => {
        s.hour12 = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Default view").addDropdown(
      (d) => d.addOptions({ year: "Year", month: "Month", week: "Week", day: "Day", reminders: "Reminders" }).setValue(s.defaultView).onChange(async (v) => {
        s.defaultView = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Private filenames").setDesc('Name new event notes "<date> <random code>" instead of "<date> <title>", so titles never show up in file listings, sync logs or the trash. Existing notes keep their names.').addToggle((t) => t.setValue(s.opaqueNames).onChange(async (v) => {
      s.opaqueNames = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Rename notes when dates change").setDesc("Off (recommended for Syncthing): a note keeps the name it was created with, so a change on one device can't leave a duplicate on another. On: the date in the file name follows the event.").addToggle((t) => t.setValue(s.renameOnChange).onChange(async (v) => {
      s.renameOnChange = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Mac notifications for alerts").setDesc("Alerts also appear in Notification Center while Obsidian is running (even in the background). Turn off to only get the popup inside Obsidian. iPhone/iPad can only show the popup while Obsidian is open.").addToggle((t) => t.setValue(s.systemNotifications).onChange(async (v) => {
      s.systemNotifications = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Hour height (px)").setDesc("Taller hours make week and day views easier to tap and drag.").addText(
      (t) => t.setValue(String(s.hourHeight)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (n >= 24 && n <= 200) {
          s.hourHeight = n;
          await this.plugin.saveSettings();
        }
      })
    );
    containerEl.createDiv({ cls: "orc-muted", text: "Clock, week start and hour height apply when the calendar is reopened. Calendar names and colors are edited from the Calendars panel." });
  }
};
function sanitizeSettings(raw) {
  var _a, _b, _c;
  const s = raw != null ? raw : {};
  const colors = {};
  if (s.colors && typeof s.colors === "object") {
    for (const [k, v] of Object.entries(s.colors)) if (typeof v === "string" && HEX2.test(v)) colors[k] = v;
  }
  return {
    rootFolder: safeRoot(s.rootFolder),
    colors,
    hidden: Array.isArray(s.hidden) ? s.hidden.filter((x) => typeof x === "string") : [],
    weekStart: s.weekStart === 1 ? 1 : 0,
    hour12: s.hour12 !== false,
    hourHeight: typeof s.hourHeight === "number" && s.hourHeight >= 24 && s.hourHeight <= 200 ? s.hourHeight : DEFAULT_SETTINGS.hourHeight,
    defaultView: s.defaultView && VIEWS.includes(s.defaultView) ? s.defaultView : "month",
    opaqueNames: s.opaqueNames === true,
    defaultCalendar: typeof s.defaultCalendar === "string" ? s.defaultCalendar.slice(0, 60) : "",
    renameOnChange: s.renameOnChange === true,
    systemNotifications: s.systemNotifications !== false,
    monthStyle: (_b = (_a = MONTH_STYLES.find((m) => m.id === s.monthStyle)) == null ? void 0 : _a.id) != null ? _b : "list",
    remindersFolder: safeRoot((_c = s.remindersFolder) != null ? _c : "Reminders"),
    listColors: Object.fromEntries(Object.entries(s.listColors && typeof s.listColors === "object" ? s.listColors : {}).filter(([, v]) => typeof v === "string" && HEX2.test(v))),
    hiddenLists: Array.isArray(s.hiddenLists) ? s.hiddenLists.filter((x) => typeof x === "string") : [],
    defaultList: typeof s.defaultList === "string" ? s.defaultList.slice(0, 60) : ""
  };
}
