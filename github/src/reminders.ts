// Reminders (Apple Reminders style): each note in <Reminders folder>/<List>/ is one reminder.
// Frontmatter: title, reminder: true, due, dueTime, completed (false | "YYYY-MM-DDTHH:mm"),
// flagged, priority (low|medium|high), repeat, url, created. Reminders have no end time.
import {
  Calendar,
  RawEvent,
  addDays,
  addMonths,
  cmpKey,
  dayOfWeek,
  isValidKey,
  normalizeDate,
  parseTime,
  pad,
  todayKey,
  toKey,
} from "./model";

export type Priority = "none" | "low" | "medium" | "high";
export type ReminderRepeat = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly";
const PRIORITIES: Priority[] = ["none", "low", "medium", "high"];
export const REMINDER_REPEATS: ReminderRepeat[] = ["none", "daily", "weekdays", "weekly", "biweekly", "monthly", "yearly"];
export const PRIORITY_MARK: Record<Priority, string> = { none: "", low: "!", medium: "!!", high: "!!!" };

export interface ReminderValues {
  title: string;
  list: string;
  due: string | null; // YYYY-MM-DD or null (no date)
  dueTime: number | null; // minutes, only with a date
  repeat: ReminderRepeat;
  flagged: boolean;
  priority: Priority;
  url?: string;
  notes?: string | null; // null = leave body untouched
}

// Reminders appear in the calendar as a short block at their time (or in the all-day row).
export const REMINDER_BLOCK_MIN = 30;

export function parseReminder(fm: Record<string, unknown> | undefined, path: string, basename: string, list: Calendar): RawEvent | null {
  if (!fm || fm.reminder !== true) return null;
  const title = typeof fm.title === "string" && fm.title.trim() ? fm.title.trim().slice(0, 500) : basename.replace(/^\d{4}-\d{2}-\d{2}\s*/, "") || "Untitled";
  const due = normalizeDate(fm.due);
  const dueTime = due ? parseTime(fm.dueTime) : null;
  const completed = typeof fm.completed === "string" && /^\d{4}-\d{2}-\d{2}/.test(fm.completed) ? fm.completed.slice(0, 16) : false;
  const priority: Priority = PRIORITIES.find((p) => p !== "none" && p === fm.priority) ?? "none";
  const repeat: ReminderRepeat = (due && REMINDER_REPEATS.find((r) => r === fm.repeat)) || "none";
  const url = typeof fm.url === "string" && /^https?:\/\/\S{1,500}$/i.test(fm.url.trim()) ? fm.url.trim() : undefined;
  const start = dueTime != null ? Math.min(dueTime, 23 * 60 + 59) : null;
  return {
    path, calendar: list, title,
    kind: "reminder",
    type: "single",
    date: due ?? undefined,
    endDate: null,
    allDay: start == null,
    startTime: start,
    endTime: start != null ? Math.min(start + REMINDER_BLOCK_MIN, 23 * 60 + 59) : null,
    completed,
    flagged: fm.flagged === true,
    priority,
    reminderRepeat: repeat,
    created: typeof fm.created === "string" ? fm.created.slice(0, 16) : undefined,
    url,
    // An open reminder with a date alerts at its time (date-only: 9:00), like Apple Reminders.
    alerts: due && !completed ? [0] : [],
  };
}

export function reminderFrontmatter(v: ReminderValues, created: string): Record<string, unknown> {
  const fm: Record<string, unknown> = { title: v.title.trim(), reminder: true };
  if (v.due) {
    fm.due = v.due;
    if (v.dueTime != null) fm.dueTime = `${pad(Math.floor(v.dueTime / 60))}:${pad(v.dueTime % 60)}`;
    if (v.repeat !== "none") fm.repeat = v.repeat;
  }
  fm.completed = false;
  if (v.flagged) fm.flagged = true;
  if (v.priority !== "none") fm.priority = v.priority;
  const url = (v.url ?? "").trim();
  if (url) fm.url = url.slice(0, 500);
  fm.created = created;
  return fm;
}

export const REMINDER_KEYS = ["title", "reminder", "due", "dueTime", "completed", "flagged", "priority", "repeat", "url", "created"];

export function nowStamp(d = new Date()): string {
  return `${toKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Next due date after completing a repeating reminder.
export function nextDue(due: string, repeat: ReminderRepeat): string {
  switch (repeat) {
    case "daily": return addDays(due, 1);
    case "weekdays": {
      let d = addDays(due, 1);
      while (dayOfWeek(d) === 0 || dayOfWeek(d) === 6) d = addDays(d, 1);
      return d;
    }
    case "weekly": return addDays(due, 7);
    case "biweekly": return addDays(due, 14);
    case "monthly": return addMonths(due, 1);
    case "yearly": return addMonths(due, 12);
    default: return due;
  }
}

// Repeat rule used to show a repeating reminder on its future dates in the calendar.
export const REMINDER_RRULE: Record<Exclude<ReminderRepeat, "none">, string> = {
  daily: "RRULE:FREQ=DAILY",
  weekdays: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "RRULE:FREQ=WEEKLY",
  biweekly: "RRULE:FREQ=WEEKLY;INTERVAL=2",
  monthly: "RRULE:FREQ=MONTHLY",
  yearly: "RRULE:FREQ=YEARLY",
};

// ---------- smart lists ----------

export type SmartList = "today" | "scheduled" | "all" | "flagged" | "completed";
export const SMART: { id: SmartList; label: string; color: string }[] = [
  { id: "today", label: "Today", color: "#007AFF" },
  { id: "scheduled", label: "Scheduled", color: "#FF3B30" },
  { id: "all", label: "All", color: "#3A3A3C" },
  { id: "flagged", label: "Flagged", color: "#FF9500" },
  { id: "completed", label: "Completed", color: "#8E8E93" },
];

export function isOverdue(r: RawEvent, now = new Date()): boolean {
  if (r.completed || !r.date) return false;
  const today = toKey(now);
  if (cmpKey(r.date, today) < 0) return true;
  if (r.date === today && r.startTime != null) return r.startTime < now.getHours() * 60 + now.getMinutes();
  return false;
}

export function inSmartList(r: RawEvent, id: SmartList, today = todayKey()): boolean {
  const open = !r.completed;
  switch (id) {
    case "today": return open && !!r.date && cmpKey(r.date, today) <= 0;
    case "scheduled": return open && !!r.date;
    case "all": return open;
    case "flagged": return open && !!r.flagged;
    case "completed": return !!r.completed;
  }
}

// Order inside a list: dated first by date/time, then undated by creation; completed newest first.
export function sortReminders(list: RawEvent[]): RawEvent[] {
  return [...list].sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    if (a.completed && b.completed) return String(b.completed).localeCompare(String(a.completed));
    if (!!a.date !== !!b.date) return a.date ? -1 : 1;
    if (a.date && b.date && a.date !== b.date) return cmpKey(a.date, b.date);
    if ((a.startTime ?? -1) !== (b.startTime ?? -1)) return (a.startTime ?? -1) - (b.startTime ?? -1);
    return (a.created ?? "").localeCompare(b.created ?? "") || a.title.localeCompare(b.title);
  });
}

export function dueLabel(r: RawEvent, fmtTime: (m: number) => string, today = todayKey()): string {
  if (!r.date || !isValidKey(r.date)) return "";
  const d = r.date === today ? "Today" : r.date === addDays(today, 1) ? "Tomorrow" : r.date === addDays(today, -1) ? "Yesterday" : shortDate(r.date, today);
  return r.startTime != null ? `${d}, ${fmtTime(r.startTime)}` : d;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function shortDate(key: string, today = todayKey()): string {
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return `${DOW[dayOfWeek(key)]}, ${MON[m - 1]} ${d}${sameYear ? "" : ", " + y}`;
}
