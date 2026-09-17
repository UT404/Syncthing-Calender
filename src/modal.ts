// Dialogs: event details, create/edit form, repeat-scope chooser, calendars, search, import/export.
// All dialogs are Obsidian's own Modal/Setting components so they match the app.
import { App, Modal, Notice, Platform, Setting, TFile } from "obsidian";
import {
  ALERT_CHOICES,
  MAX_ALERTS,
  Calendar,
  EventInstance,
  RawEvent,
  DAY_NAMES,
  MONTH_NAMES,
  MONTH_SHORT,
  WEEKDAY_LETTERS,
  addDays,
  cmpKey,
  dayOfWeek,
  describeRRule,
  diffDays,
  formatTime,
  keyParts,
  minutesToHHMM,
  parseRRule,
  parseTime,
  todayKey,
} from "./model";
import { ImportedEvent, MAX_ICS_BYTES, parseICS } from "./ics";
import { PRIORITY_MARK, Priority, REMINDER_REPEATS, ReminderRepeat, ReminderValues, dueLabel } from "./reminders";

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly";
export type Scope = "this" | "all";

export interface EventFormValues {
  title: string;
  calendar: string;
  date: string;
  endDate: string | null;
  allDay: boolean;
  startTime: number | null;
  endTime: number | null;
  repeat: Repeat;
  repeatUntil: string | null;
  location?: string;
  url?: string;
  alerts?: number[];
  notes?: string | null; // null/undefined = leave the note body untouched
}

export interface EventStore {
  getCalendars(): Calendar[];
  getInstances(from: string, to: string): EventInstance[];
  rootFolder(): string;
  createCalendar(name: string, color: string): Promise<void>;
  renameCalendar(oldName: string, newName: string): Promise<void>;
  setCalendarColor(name: string, color: string): Promise<void>;
  deleteCalendar(name: string): Promise<void>;
  countEvents(calendarName: string): number;
  folderContents(calendarName: string): { events: number; other: number };
  searchInstances(query: string, from: string, to: string): { items: EventInstance[]; truncated: boolean };
  createEvent(values: EventFormValues): Promise<void>;
  // instanceDate: the occurrence the user was looking at (recurring events), so date edits
  // shift the whole series by the same number of days.
  updateEvent(raw: RawEvent, values: EventFormValues, instanceDate?: string): Promise<void>;
  updateOccurrence(raw: RawEvent, instanceDate: string, values: EventFormValues): Promise<void>;
  deleteEvent(raw: RawEvent): Promise<void>;
  deleteOccurrence(raw: RawEvent, instanceDate: string): Promise<void>;
  duplicateEvent(raw: RawEvent): Promise<void>;
  readBody(raw: RawEvent): Promise<string>;
  openNote(raw: RawEvent): Promise<void>;
  exportCalendars(names: string[] | null): Promise<string>; // returns the vault path written
  importEvents(events: ImportedEvent[], calendarName: string): Promise<{ created: number; duplicates: number }>;
  hour12(): boolean;
  // reminders
  getLists(): Calendar[];
  getReminders(): RawEvent[];
  remindersFolder(): string;
  defaultList(): string;
  createReminder(v: ReminderValues): Promise<void>;
  updateReminder(raw: RawEvent, v: ReminderValues): Promise<void>;
  toggleReminder(raw: RawEvent): Promise<void>;
  clearCompleted(listName: string | null): Promise<number>;
  createList(name: string, color: string): Promise<void>;
  renameList(oldName: string, newName: string): Promise<void>;
  setListColor(name: string, color: string): Promise<void>;
  deleteList(name: string): Promise<void>;
  listContents(name: string): { events: number; other: number };
  isListHidden(name: string): boolean;
  setListHidden(name: string, hidden: boolean): void;
}

// ---------- repeat helpers ----------

export function repeatOf(raw: RawEvent): { repeat: Repeat; until: string | null } {
  if (raw.type === "recurring") {
    const days = [...raw.daysOfWeek!].sort().join(",");
    return { repeat: days === "1,2,3,4,5" ? "weekdays" : "weekly", until: raw.endRecur ?? null };
  }
  if (raw.type === "rrule") {
    const r = parseRRule(raw.rrule!);
    const u = raw.rrule!.match(/UNTIL=(\d{4})(\d{2})(\d{2})/i);
    const until = u ? `${u[1]}-${u[2]}-${u[3]}` : null;
    if (!r) return { repeat: "none", until };
    if (r.freq === "WEEKLY" && r.interval === 2) return { repeat: "biweekly", until };
    return { repeat: r.freq.toLowerCase() as Repeat, until };
  }
  return { repeat: "none", until: null };
}

export function describeRepeat(raw: RawEvent): string | null {
  if (raw.type === "recurring") {
    const names = raw.daysOfWeek!.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
    return `Every ${names}` + (raw.endRecur ? ` until ${raw.endRecur}` : "");
  }
  if (raw.type === "rrule") return describeRRule(raw.rrule!);
  return null;
}

const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Never", daily: "Every day", weekdays: "Every weekday (Mon–Fri)", weekly: "Every week",
  biweekly: "Every 2 weeks", monthly: "Every month", yearly: "Every year",
};

export function alertLabel(min: number | null | undefined): string {
  if (min == null) return "None";
  if (min === 0) return "At time of event";
  if (min % 10080 === 0) return `${min / 10080} week${min === 10080 ? "" : "s"} before`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"} before`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"} before`;
  return `${min} minutes before`;
}

// ---------- details popup ----------

export class EventDetailsModal extends Modal {
  constructor(app: App, private inst: EventInstance, private store: EventStore) {
    super(app);
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
    else when.createDiv({ cls: "orc-muted", text: `${formatTime(ev.start, h12)} – ${formatTime(ev.end, h12)}` });
    const rep = describeRepeat(ev.raw);
    if (rep) when.createDiv({ cls: "orc-muted", text: "Repeats: " + rep });
    if (ev.raw.location) when.createDiv({ text: "Location: " + ev.raw.location });
    if (ev.raw.url) when.createDiv({ cls: "orc-muted orc-selectable", text: ev.raw.url });
    if (ev.raw.alerts.length) when.createDiv({ cls: "orc-muted", text: (ev.raw.alerts.length === 1 ? "Alert: " : "Alerts: ") + ev.raw.alerts.map(alertLabel).join(", ") });

    const notes = contentEl.createDiv({ cls: "orc-detail-notes orc-selectable" });
    void this.store.readBody(ev.raw).then((b) => { const txt = b.trim(); if (txt) notes.setText(txt.slice(0, 2000)); });

    const recurring = ev.raw.type !== "single";
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Open note" }).addEventListener("click", () => { this.close(); void this.store.openNote(ev.raw); });
    btns.createEl("button", { text: "Duplicate" }).addEventListener("click", runAsync(async () => {
      this.close();
      try { await this.store.duplicateEvent(ev.raw); new Notice("Event duplicated"); } catch { new Notice("Could not duplicate the event."); }
    }));
    btns.createEl("button", { text: "Delete", cls: "mod-warning" }).addEventListener("click", () => {
      this.close();
      const body = "The note goes to the trash chosen in Obsidian's 'Deleted files' setting. Copies may remain in your system trash, Syncthing versioning and Obsidian File Recovery until you clear those.";
      if (recurring) {
        new ScopeModal(this.app, `Delete "${ev.title}"?`, "This is a repeating event.", "Delete this event only", "Delete all events", async (scope) => {
          try {
            if (scope === "this") await this.store.deleteOccurrence(ev.raw, ev.date);
            else await this.store.deleteEvent(ev.raw);
          } catch { new Notice("Could not delete the event."); }
        }, true).open();
      } else {
        new ConfirmModal(this.app, `Delete "${ev.title}"?`, body, async () => {
          try { await this.store.deleteEvent(ev.raw); } catch { new Notice("Could not delete the note."); }
        }).open();
      }
    });
    btns.createEl("button", { text: "Edit", cls: "mod-cta" }).addEventListener("click", () => {
      this.close();
      new EventFormModal(this.app, this.store, { raw: ev.raw, instanceDate: ev.date }).open();
    });
  }
  onClose() { this.contentEl.empty(); }
}

// Obsidian-native confirm dialog (window.confirm is unreliable on mobile).
export class ConfirmModal extends Modal {
  constructor(app: App, private title: string, private body: string, private onConfirm: () => void | Promise<void>, private okText = "Delete") {
    super(app);
  }
  onOpen() {
    this.modalEl.addClass("orc-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: this.title });
    this.contentEl.createDiv({ cls: "orc-muted", text: this.body });
    const btns = this.contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const ok = btns.createEl("button", { text: this.okText, cls: "mod-warning" });
    ok.addEventListener("click", () => { this.close(); void this.onConfirm(); });
  }
  onClose() { this.contentEl.empty(); }
}

// "This event only / All events" chooser for repeating events (like Apple Calendar).
export class ScopeModal extends Modal {
  private done = false;
  constructor(
    app: App, private title: string, private body: string, private thisText: string, private allText: string,
    private onPick: (scope: Scope) => void | Promise<void>, private destructive = false, private onCancel?: () => void,
  ) {
    super(app);
  }
  onOpen() {
    this.modalEl.addClass("orc-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: this.title });
    this.contentEl.createDiv({ cls: "orc-muted", text: this.body });
    const btns = this.contentEl.createDiv({ cls: "orc-detail-btns orc-scope-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const cls = this.destructive ? "mod-warning" : "mod-cta";
    btns.createEl("button", { text: this.thisText, cls }).addEventListener("click", () => { this.done = true; this.close(); void this.onPick("this"); });
    btns.createEl("button", { text: this.allText, cls }).addEventListener("click", () => { this.done = true; this.close(); void this.onPick("all"); });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.done && this.onCancel) this.onCancel();
  }
}

// ---------- create / edit form ----------

export interface FormInit {
  raw?: RawEvent;
  instanceDate?: string;
  date?: string;
  startMinutes?: number | null;
  endMinutes?: number | null;
  allDay?: boolean;
  endDate?: string | null; // drag-created events spanning several days
  defaultCalendar?: string;
  onCancel?: () => void;
}

export class EventFormModal extends Modal {
  private v: EventFormValues;
  private raw: RawEvent | null;
  private instanceDate: string | null;
  private originalBody: string | null = null;
  private saved = false;

  constructor(app: App, private store: EventStore, private init: FormInit) {
    super(app);
    this.raw = init.raw ?? null;
    this.instanceDate = init.instanceDate ?? null;
    const cals = store.getCalendars();
    if (this.raw) {
      const r = this.raw;
      const rep = repeatOf(r);
      const seriesStart = r.type === "single" ? r.date! : r.type === "recurring" ? r.startRecur ?? "" : r.startDate!;
      this.v = {
        title: r.title,
        calendar: r.calendar.name,
        // Like Apple Calendar, a repeating event opens on the occurrence you tapped.
        date: r.type !== "single" && this.instanceDate ? this.instanceDate : seriesStart,
        endDate: r.type === "single" ? r.endDate ?? null : null,
        allDay: r.allDay,
        startTime: r.startTime,
        endTime: r.endTime,
        repeat: rep.repeat,
        repeatUntil: rep.until,
        location: r.location ?? "",
        url: r.url ?? "",
        alerts: [...r.alerts],
        notes: null,
      };
    } else {
      const start = init.startMinutes ?? 9 * 60;
      const end = init.endMinutes ?? Math.min(start + 60, 23 * 60 + 59);
      this.v = {
        title: "",
        calendar: init.defaultCalendar && cals.some((c) => c.name === init.defaultCalendar) ? init.defaultCalendar : cals[0]?.name ?? "",
        date: init.date ?? todayKey(),
        endDate: init.endDate && init.date && init.endDate > init.date ? init.endDate : null,
        allDay: init.allDay ?? false,
        startTime: start,
        endTime: end,
        repeat: "none",
        repeatUntil: null,
        location: "",
        url: "",
        alerts: [],
        notes: "",
      };
    }
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    modalEl.addClass("orc-form");
    contentEl.empty();
    if (!this.raw) {
      // Apple-style switch at the top: Event | Reminder. Carries title/date/time across.
      kindToggle(contentEl, "event", () => {
        this.saved = true; // switching isn't cancelling: keep the drag preview
        this.close();
        new ReminderFormModal(this.app, this.store, {
          title: this.v.title, due: this.v.date, dueTime: this.v.allDay ? null : this.v.startTime,
          onCancel: this.init.onCancel, eventInit: this.init,
        }).open();
      });
    }
    contentEl.createEl("h3", { text: this.raw ? "Edit event" : "New event" });
    const cals = this.store.getCalendars();
    if (!cals.length) {
      renderNoCalendars(contentEl, this.app, this.store, () => { this.close(); new EventFormModal(this.app, this.store, this.init).open(); });
      return;
    }
    let endDateInput: HTMLInputElement | null = null;
    let untilInput: HTMLInputElement | null = null;

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("New event").setValue(this.v.title).onChange((x) => (this.v.title = x));
      t.inputEl.addClass("orc-wide");
      t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") void this.save(); });
      if (!Platform.isMobile) window.setTimeout(() => t.inputEl.focus(), 50);
    });
    new Setting(contentEl).setName("Location").addText((t) => {
      t.setPlaceholder("Optional").setValue(this.v.location ?? "").onChange((x) => (this.v.location = x));
      t.inputEl.addClass("orc-wide");
    });

    const calRow = new Setting(contentEl).setName("Calendar").addDropdown((d) => {
      for (const c of cals) d.addOption(c.name, c.name);
      d.setValue(this.v.calendar).onChange((x) => { this.v.calendar = x; paintDot(); });
    });
    const dot = createDot(calRow.settingEl);
    const paintDot = () => { dot.style.background = cals.find((c) => c.name === this.v.calendar)?.color ?? "transparent"; };
    paintDot();

    // Rows are plain siblings (no wrapper divs) so Obsidian's row spacing and borders line up.
    new Setting(contentEl).setName("All-day").addToggle((t) =>
      t.setValue(this.v.allDay).onChange((x) => { this.v.allDay = x; showTimes(); })
    );
    new Setting(contentEl).setName("Date").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.v.date).onChange((x) => (this.v.date = x));
    });
    let endInput: HTMLInputElement | null = null;
    const startRow = new Setting(contentEl).setName("Starts").addText((t) => {
      t.inputEl.type = "time";
      t.setValue(this.v.startTime != null ? minutesToHHMM(Math.min(this.v.startTime, 1439)) : "09:00").onChange((x) => {
        this.v.startTime = parseTime(x);
        // Start moved to (or past) the end: the end follows, 30 minutes after the start.
        const s = this.v.startTime;
        const multiDay = !!this.v.endDate && this.v.endDate > this.v.date; // end is on a later day: any time is fine
        if (s != null && !multiDay && (this.v.endTime == null || this.v.endTime <= s)) {
          this.v.endTime = Math.min(s + 30, 23 * 60 + 59);
          if (endInput) endInput.value = minutesToHHMM(this.v.endTime);
        }
      });
    });
    const endRow = new Setting(contentEl).setName("Ends").addText((t) => {
      endInput = t.inputEl;
      t.inputEl.type = "time";
      t.setValue(this.v.endTime != null ? minutesToHHMM(Math.min(this.v.endTime, 1439)) : "10:00").onChange((x) => (this.v.endTime = parseTime(x)));
    });
    const showTimes = () => {
      startRow.settingEl.style.display = this.v.allDay ? "none" : "";
      endRow.settingEl.style.display = this.v.allDay ? "none" : "";
    };
    showTimes();

    const endDateRow = new Setting(contentEl).setName("End date").setDesc("Only for multi-day events").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.v.endDate ?? "").onChange((x) => (this.v.endDate = x || null));
      endDateInput = t.inputEl;
    }).addButton((b) => b.setButtonText("Clear").onClick(() => { this.v.endDate = null; if (endDateInput) endDateInput.value = ""; }));

    new Setting(contentEl).setName("Repeat").addDropdown((d) => {
      d.addOptions(REPEAT_LABELS);
      d.setValue(this.v.repeat).onChange((x) => { this.v.repeat = x as Repeat; showRepeat(); });
    });
    const untilRow = new Setting(contentEl).setName("End repeat").setDesc("Leave empty for never").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.v.repeatUntil ?? "").onChange((x) => (this.v.repeatUntil = x || null));
      untilInput = t.inputEl;
    }).addButton((b) => b.setButtonText("Clear").onClick(() => { this.v.repeatUntil = null; if (untilInput) untilInput.value = ""; }));
    const showRepeat = () => {
      untilRow.settingEl.style.display = this.v.repeat === "none" ? "none" : "";
      endDateRow.settingEl.style.display = this.v.repeat === "none" ? "" : "none";
    };
    showRepeat();

    // Up to 4 alerts, like Apple Calendar. Rows are inserted as plain siblings (no wrapper) so
    // Obsidian's row spacing stays even; picking "None" removes that alert.
    const urlRow = new Setting(contentEl).setName("URL").addText((t) => {
      t.setPlaceholder("Optional").setValue(this.v.url ?? "").onChange((x) => (this.v.url = x));
      t.inputEl.addClass("orc-wide");
    });
    let alertRows: HTMLElement[] = [];
    const names = ["Alert", "Second alert", "Third alert", "Fourth alert"];
    const renderAlerts = () => {
      alertRows.forEach((r) => r.remove());
      alertRows = [];
      const list = this.v.alerts ?? (this.v.alerts = []);
      const rows = Math.min(MAX_ALERTS, list.length + 1);
      for (let i = 0; i < rows; i++) {
        const row = new Setting(contentEl).setName(names[i]);
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
    notes.addEventListener("input", () => (this.v.notes = notes.value));
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

  private async save() {
    const v = this.v;
    if (!v.title.trim()) { new Notice("Give the event a title."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) { new Notice("Pick a date."); return; }
    if (!v.allDay) {
      if (v.startTime == null) { new Notice("Pick a start time."); return; }
      const multiDay = !!v.endDate && v.endDate > v.date;
      if (!multiDay && v.endTime != null && v.endTime <= v.startTime) { new Notice("End time must be after start time."); return; }
    }
    if (v.endDate && v.endDate <= v.date) v.endDate = null;
    if (v.repeat !== "none") v.endDate = null;
    if (v.url && !/^https?:\/\/\S+$/i.test(v.url.trim())) { new Notice("URL must start with http:// or https://"); return; }
    if (this.raw && v.notes != null && v.notes === this.originalBody) v.notes = null;
    const commit = async (scope: Scope | null) => {
      try {
        if (!this.raw) await this.store.createEvent(v);
        else if (scope === "this") await this.store.updateOccurrence(this.raw, this.instanceDate!, { ...v, repeat: "none", repeatUntil: null });
        else await this.store.updateEvent(this.raw, v, this.instanceDate ?? undefined);
        this.saved = true;
        this.close();
      } catch (e) {
        new Notice((e as Error).message?.startsWith("SC:") ? (e as Error).message.slice(3) : "Could not save the event. Check that the calendar folder still exists.");
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
}

function createDot(settingEl: HTMLElement): HTMLElement {
  const ctrl = settingEl.querySelector<HTMLElement>(".setting-item-control") ?? settingEl;
  const dot = createSpan();
  dot.className = "orc-cal-dot";
  ctrl.insertBefore(dot, ctrl.firstChild);
  return dot;
}

// ---------- note frontmatter ----------

const WORD: Record<Repeat, string> = {
  none: "", daily: "every day", weekdays: "", weekly: "", biweekly: "every 2 weeks", monthly: "every month", yearly: "every year",
};
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Build Full Calendar-compatible frontmatter + filename for form values.
export function frontmatterFor(v: EventFormValues, original?: RawEvent, opaque = false): { fm: Record<string, unknown>; basename: string } {
  const fm = baseFields(v);
  const name = opaque ? randomCode() : safeName(v.title);
  const untilCompact = v.repeatUntil ? v.repeatUntil.replace(/-/g, "") : null;
  const sameRepeat = original ? repeatOf(original).repeat === v.repeat : false;

  // Editing without changing the repeat type keeps the original rule (weekday list,
  // INTERVAL/BYDAY..., skipDates) instead of flattening it.
  if (original && sameRepeat && original.type === "recurring") {
    fm.type = "recurring";
    fm.daysOfWeek = original.daysOfWeek!.map((d) => WEEKDAY_LETTERS[d]);
    const startRecur = original.startRecur ? v.date || original.startRecur : undefined;
    if (startRecur) fm.startRecur = startRecur;
    if (v.repeatUntil) fm.endRecur = v.repeatUntil;
    if (original.skipDates?.length) fm.skipDates = original.skipDates;
    return { fm, basename: `(Every ${(fm.daysOfWeek as string[]).join(",")}) ${name}` };
  }
  if (original && sameRepeat && original.type === "rrule") {
    fm.type = "rrule";
    fm.startDate = v.date;
    const base = original.rrule!.replace(/;?UNTIL=[^;]*/i, "");
    fm.rrule = base + (untilCompact ? `;UNTIL=${untilCompact}` : "");
    fm.skipDates = original.skipDates ?? [];
    return { fm, basename: `(${describeRRule(fm.rrule as string)}) ${name}` };
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
      let rrule = v.repeat === "biweekly"
        ? `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${BYDAY[dayOfWeek(v.date)]}`
        : `RRULE:FREQ=${v.repeat.toUpperCase()}`;
      if (untilCompact) rrule += `;UNTIL=${untilCompact}`;
      fm.rrule = rrule;
      fm.skipDates = [];
      return { fm, basename: `(${WORD[v.repeat]}) ${name}` };
    }
  }
}

function baseFields(v: EventFormValues): Record<string, unknown> {
  const fm: Record<string, unknown> = { title: v.title.trim() };
  if (v.allDay) fm.allDay = true;
  else {
    fm.allDay = false;
    fm.startTime = minutesToHHMM(v.startTime!);
    if (v.endTime != null) fm.endTime = minutesToHHMM(v.endTime);
  }
  const loc = (v.location ?? "").trim();
  if (loc) fm.location = loc.slice(0, 300);
  const url = (v.url ?? "").trim();
  if (url) fm.url = url.slice(0, 500);
  const alerts = [...new Set(v.alerts ?? [])].sort((a, b) => b - a).slice(0, MAX_ALERTS);
  if (alerts.length === 1) fm.alert = alerts[0];
  else if (alerts.length > 1) fm.alert = alerts;
  return fm;
}

// Series edited from one occurrence ("All events"): shift the whole rule by the same number of
// days the occurrence moved, keep its pattern, apply the new title/times/extras.
// Returns null when the rule cannot be shifted faithfully (monthly-by-day rules crossing month ends).
export function seriesFrontmatter(raw: RawEvent, v: EventFormValues, dayDelta: number, opaque = false): { fm: Record<string, unknown>; basename: string } | null {
  const fm = baseFields(v);
  const name = opaque ? randomCode() : safeName(v.title);
  const shift = (k: string | undefined) => (k ? addDays(k, dayDelta) : undefined);
  const shiftDow = (d: number) => (((d + dayDelta) % 7) + 7) % 7;
  const skips = (raw.skipDates ?? []).map((k) => addDays(k, dayDelta));
  // "End repeat": if the user left it as it was, it moves with the series; a new value wins;
  // clearing it means "never".
  const origUntil = repeatOf(raw).until;
  const untilFor = (orig: string | undefined | null) =>
    v.repeatUntil == null ? null : v.repeatUntil === origUntil && orig ? addDays(orig, dayDelta) : v.repeatUntil;
  if (raw.type === "recurring") {
    fm.type = "recurring";
    fm.daysOfWeek = raw.daysOfWeek!.map((d) => WEEKDAY_LETTERS[shiftDow(d)]);
    const sr = shift(raw.startRecur);
    if (sr) fm.startRecur = sr;
    const er = untilFor(raw.endRecur);
    if (er) fm.endRecur = er;
    if (skips.length) fm.skipDates = skips;
    return { fm, basename: `(Every ${(fm.daysOfWeek as string[]).join(",")}) ${name}` };
  }
  if (raw.type === "rrule") {
    const r = parseRRule(raw.rrule!);
    if (!r) return null;
    const parts: string[] = [`FREQ=${r.freq}`];
    if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
    if (r.byDay?.length) parts.push(`BYDAY=${r.byDay.map((d) => BYDAY[shiftDow(d)]).join(",")}`);
    if (r.byMonthDay?.length) {
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
    fm.startDate = addDays(raw.startDate!, dayDelta);
    fm.rrule = "RRULE:" + parts.join(";");
    fm.skipDates = skips;
    return { fm, basename: `(${describeRRule(fm.rrule as string)}) ${name}` };
  }
  return null;
}

// Six random base32 characters from the platform CSPRNG, for "private filenames" mode.
export function randomCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// Filesystem-safe note name: strips path separators, Obsidian-reserved characters and control chars.
export function safeName(s: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally matches control characters to strip them from untrusted text
  const cleaned = s.replace(/[\\/:*?"<>|#^[\]\x00-\x1f\x7f]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 120).trim();
  return cleaned || "Untitled event";
}

// ---------- calendars ----------

// Shared empty state: explains the folder rule and offers to create the first calendar.
export function renderNoCalendars(parent: HTMLElement, app: App, store: EventStore, onCreated: () => void) {
  const root = store.rootFolder();
  const box = parent.createDiv({ cls: "orc-empty orc-setup" });
  box.createDiv({ text: `No calendars yet. Each sub-folder inside "${root}" is one calendar, and every note in a sub-folder is one event.` });
  box.createDiv({ cls: "orc-muted", text: `Folder: ${root}/ — change it in Settings → Syncthing Calendar.` });
  const btn = box.createEl("button", { text: "New calendar…", cls: "mod-cta" });
  btn.addEventListener("click", () => new CalendarModal(app, store, null, onCreated).open());
}

export const SWATCHES = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#5AC8FA", "#AF52DE", "#FF2D55", "#A2845E", "#8E8E93"];
const HEX = /^#[0-9a-f]{6}$/i;

// New calendar (existing = null) or "Get Info" on an existing one: name, color, delete.
export class CalendarModal extends Modal {
  private name: string;
  private color: string;
  private kind: "calendar" | "list";
  constructor(app: App, private store: EventStore, private existing: Calendar | null, private onDone: () => void, suggestedColor = "#007AFF", kind: "calendar" | "list" = "calendar") {
    super(app);
    this.kind = kind;
    this.name = existing?.name ?? "";
    this.color = existing?.color ?? suggestedColor;
  }
  private get ops() {
    const s = this.store;
    return this.kind === "list"
      ? { noun: "list", items: "reminder", root: s.remindersFolder(), all: s.getLists(), create: s.createList.bind(s), rename: s.renameList.bind(s), color: s.setListColor.bind(s), del: s.deleteList.bind(s), contents: s.listContents.bind(s) }
      : { noun: "calendar", items: "event", root: s.rootFolder(), all: s.getCalendars(), create: s.createCalendar.bind(s), rename: s.renameCalendar.bind(s), color: s.setCalendarColor.bind(s), del: s.deleteCalendar.bind(s), contents: s.folderContents.bind(s) };
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    const o = this.ops;
    const Noun = o.noun[0].toUpperCase() + o.noun.slice(1);
    contentEl.createEl("h3", { text: this.existing ? `${Noun} info` : `New ${o.noun}` });
    if (!this.existing) contentEl.createDiv({ cls: "orc-muted", text: `Creates the folder ${o.root}/<name>. ${o.items[0].toUpperCase() + o.items.slice(1)}s you add to this ${o.noun} become notes inside it.` });
    new Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder(this.kind === "list" ? "Groceries, Errands, Work…" : "Work, Family, Health…").setValue(this.name).onChange((v) => (this.name = v));
      t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") void this.save(); });
      if (!Platform.isMobile) window.setTimeout(() => t.inputEl.focus(), 50);
    });
    const colorRow = new Setting(contentEl).setName("Color");
    const swatches = colorRow.settingEl.createDiv({ cls: "orc-swatches" });
    const paint = () => swatches.querySelectorAll<HTMLElement>(".orc-swatch").forEach((el) => el.toggleClass("is-on", el.getAttribute("data-color")!.toLowerCase() === this.color.toLowerCase()));
    for (const c of SWATCHES) {
      const sw = swatches.createDiv({ cls: "orc-swatch", attr: { "data-color": c, "aria-label": c } });
      sw.style.background = c;
      sw.addEventListener("click", () => { this.color = c; paint(); });
    }
    colorRow.addColorPicker((p) => p.setValue(this.color).onChange((v) => { if (HEX.test(v)) { this.color = v; paint(); } }));
    paint();
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    if (this.existing) {
      const { events: n, other } = o.contents(this.existing.name);
      btns.createEl("button", { text: `Delete ${o.noun}`, cls: "mod-warning orc-left" }).addEventListener("click", () => {
        const ex = this.existing!;
        this.close();
        if (other > 0) {
          new Notice(`"${ex.name}" also holds ${other} file${other === 1 ? "" : "s"} that ${other === 1 ? `isn't a ${o.items}` : `aren't ${o.items}s`}. Move ${other === 1 ? "it" : "them"} out first, or delete the folder yourself.`, 8000);
          return;
        }
        new ConfirmModal(this.app, `Delete "${ex.name}"?`, `The folder and its ${n} ${o.items} note${n === 1 ? "" : "s"} go to the trash chosen in Obsidian's 'Deleted files' setting.`, async () => {
          try { await o.del(ex.name); this.onDone(); } catch (e) { new Notice((e as Error).message?.startsWith("SC:") ? (e as Error).message.slice(3) : `Could not delete the ${o.noun}.`); }
        }, `Delete ${o.noun}`).open();
      });
    }
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btns.createEl("button", { text: this.existing ? "Save" : "Create", cls: "mod-cta" }).addEventListener("click", () => void this.save());
  }
  private async save() {
    const name = safeFolderName(this.name);
    const o = this.ops;
    if (!name) { new Notice(`Give the ${o.noun} a name.`); return; }
    const clash = o.all.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.name !== this.existing?.name);
    if (clash) { new Notice(`"${name}" already exists.`); return; }
    try {
      if (!this.existing) {
        await o.create(name, this.color);
        new Notice(`${o.noun[0].toUpperCase() + o.noun.slice(1)} "${name}" created`);
      } else {
        if (name !== this.existing.name) await o.rename(this.existing.name, name);
        await o.color(name, this.color);
      }
      this.close();
      this.onDone();
    } catch {
      new Notice(`Could not save the ${o.noun}.`);
    }
  }
  onClose() { this.contentEl.empty(); }
}

// Folder-safe calendar name (same character rules as note names, no leading dot).
export function safeFolderName(s: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally matches control characters to strip them from untrusted text
  return s.replace(/[\\/:*?"<>|#^[\]\x00-\x1f\x7f]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 60).trim();
}

// ---------- search ----------

export class SearchModal extends Modal {
  constructor(app: App, private store: EventStore, private onPick: (date: string) => void) {
    super(app);
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
    let timer: number | null = null;
    const run = () => {
      list.empty();
      const q = input.value.trim().toLowerCase().slice(0, 100);
      if (q.length < 1) { list.createDiv({ cls: "orc-muted", text: "Searches one year back and two years ahead." }); return; }
      const res = this.store.searchInstances(q, from, to);
      const hits = res.items;
      // Upcoming first, then past (most recent first), like Apple's search list.
      const upcoming = hits.filter((i) => cmpKey(i.date, today) >= 0);
      const past = hits.filter((i) => cmpKey(i.date, today) < 0).reverse();
      const shown = [...upcoming, ...past].slice(0, 100);
      if (!shown.length) { list.createDiv({ cls: "orc-muted", text: "No matching events." }); return; }
      for (const i of shown) {
        const row = list.createDiv({ cls: "orc-listrow" });
        const p = keyParts(i.date);
        row.createDiv({ cls: "orc-listtime", text: `${MONTH_SHORT[p.m - 1]} ${p.d}${p.y !== keyParts(today).y ? ", " + p.y : ""}` });
        const bar = row.createDiv({ cls: "orc-listbar" });
        bar.style.background = i.calendar.color;
        const txt = row.createDiv({ cls: "orc-listtext" });
        txt.createDiv({ cls: "orc-listtitle", text: i.title });
        txt.createDiv({ cls: "orc-muted", text: `${i.allDay ? "all-day" : formatTime(i.start, this.store.hour12())} · ${i.calendar.name}` });
        row.addEventListener("click", () => { this.close(); this.onPick(i.date); });
      }
      if (hits.length > shown.length || res.truncated) list.createDiv({ cls: "orc-muted", text: "More matches not shown — refine the search." });
    };
    input.addEventListener("input", () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(run, 120); });
    run();
    if (!Platform.isMobile) window.setTimeout(() => input.focus(), 50);
  }
  onClose() { this.contentEl.empty(); }
}

// ---------- import / export ----------

export class ImportModal extends Modal {
  private events: ImportedEvent[] = [];
  private calendar: string;
  constructor(app: App, private store: EventStore, private onDone: () => void) {
    super(app);
    this.calendar = store.getCalendars()[0]?.name ?? "";
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    contentEl.createEl("h3", { text: "Import .ics" });
    contentEl.createDiv({ cls: "orc-muted", text: "Reads a calendar file from this device and creates one note per event. Nothing is uploaded." });
    const cals = this.store.getCalendars();
    if (!cals.length) { renderNoCalendars(contentEl, this.app, this.store, () => { this.close(); new ImportModal(this.app, this.store, this.onDone).open(); }); return; }
    new Setting(contentEl).setName("Into calendar").addDropdown((d) => {
      for (const c of cals) d.addOption(c.name, c.name);
      d.setValue(this.calendar).onChange((x) => (this.calendar = x));
    });
    const status = contentEl.createDiv({ cls: "orc-import-status orc-muted", text: "No file chosen." });
    const input = contentEl.createEl("input", { attr: { type: "file", accept: ".ics,text/calendar" } });
    input.setCssStyles({ display: "none" });
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Choose file…" }).addEventListener("click", () => input.click());
    const go = btns.createEl("button", { text: "Import", cls: "mod-cta" });
    go.setAttribute("disabled", "true");
    input.addEventListener("change", runAsync(async () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > MAX_ICS_BYTES) { status.setText("That file is larger than 5 MB."); return; }
      try {
        const res = parseICS(await f.text());
        this.events = res.events;
        status.setText(`${res.events.length} event${res.events.length === 1 ? "" : "s"} found` + (res.skipped ? `, ${res.skipped} skipped (unsupported repeat rules or missing dates)` : "") + ".");
        if (res.events.length) go.removeAttribute("disabled"); else go.setAttribute("disabled", "true");
      } catch (e) {
        status.setText((e as Error).message || "Could not read that file.");
      }
    }));
    go.addEventListener("click", runAsync(async () => {
      go.setAttribute("disabled", "true");
      try {
        const r = await this.store.importEvents(this.events, this.calendar);
        new Notice(`Imported ${r.created} event${r.created === 1 ? "" : "s"}` + (r.duplicates ? ` (${r.duplicates} already there)` : ""));
        this.close();
        this.onDone();
      } catch { new Notice("Import failed."); go.removeAttribute("disabled"); }
    }));
  }
  onClose() { this.contentEl.empty(); }
}

export class ExportModal extends Modal {
  private choice = "__all__";
  constructor(app: App, private store: EventStore) { super(app); }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    contentEl.createEl("h3", { text: "Export .ics" });
    contentEl.createDiv({ cls: "orc-muted", text: "Writes a standard calendar file into the \"Calendar exports\" folder of your vault (so it syncs like any note). Open or AirDrop it to import into Apple Calendar, Google Calendar, Outlook or any other calendar app. Note text is included as the event description; \"All calendars\" includes hidden ones." });
    new Setting(contentEl).setName("Calendar").addDropdown((d) => {
      d.addOption("__all__", "All calendars");
      for (const c of this.store.getCalendars()) d.addOption(c.name, c.name);
      d.setValue(this.choice).onChange((x) => (this.choice = x));
    });
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btns.createEl("button", { text: "Export", cls: "mod-cta" }).addEventListener("click", runAsync(async () => {
      try {
        const path = await this.store.exportCalendars(this.choice === "__all__" ? null : [this.choice]);
        new Notice(`Exported to ${path}`, 8000);
        this.close();
      } catch { new Notice("Export failed."); }
    }));
  }
  onClose() { this.contentEl.empty(); }
}

// Wraps an async DOM handler so the returned promise is handled instead of floating.
function runAsync(fn: () => Promise<void>): () => void {
  return () => { void fn(); };
}

export function dayDeltaOf(from: string, to: string): number { return diffDays(from, to); }

// Syncthing keeps both versions when an event note was changed on two devices before they synced.
export class ConflictsModal extends Modal {
  constructor(app: App, private files: TFile[], private onPick: (f: TFile) => void) { super(app); }
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
      row.addEventListener("click", () => { this.close(); this.onPick(f); });
    }
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
  }
  onClose() { this.contentEl.empty(); }
}

// Where alerts appear, stated plainly for the platform the form is shown on.
function alertHint(): string {
  return Platform.isMobile
    ? "Pops up in Obsidian while it's open on screen. iPhone can't alert when Obsidian is closed."
    : "Mac notification + popup while Obsidian is running (window can be in the background).";
}

// ---------- reminders ----------

function kindToggle(parent: HTMLElement, current: "event" | "reminder", onSwitch: () => void) {
  const seg = parent.createDiv({ cls: "orc-kind-toggle" });
  for (const k of ["event", "reminder"] as const) {
    const b = seg.createDiv({ cls: "orc-kind-btn", text: k === "event" ? "Event" : "Reminder" });
    b.toggleClass("is-active", k === current);
    if (k !== current) b.addEventListener("click", onSwitch);
  }
}

const RREPEAT_LABELS: Record<ReminderRepeat, string> = {
  none: "Never", daily: "Every day", weekdays: "Every weekday (Mon–Fri)", weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Every month", yearly: "Every year",
};

export interface ReminderInit {
  raw?: RawEvent;
  title?: string;
  due?: string | null;
  dueTime?: number | null;
  list?: string;
  flagged?: boolean;
  onCancel?: () => void;
  eventInit?: FormInit; // lets the toggle go back to "Event" with the same values
}

// New/edit reminder: like Apple, one date and an optional time, no end time.
export class ReminderFormModal extends Modal {
  private v: ReminderValues;
  private raw: RawEvent | null;
  private saved = false;
  private originalBody: string | null = null;
  constructor(app: App, private store: EventStore, private init: ReminderInit) {
    super(app);
    this.raw = init.raw ?? null;
    const r = this.raw;
    this.v = r
      ? { title: r.title, list: r.calendar.name, due: r.date ?? null, dueTime: r.startTime, repeat: r.reminderRepeat ?? "none", flagged: !!r.flagged, priority: r.priority ?? "none", url: r.url ?? "", notes: null }
      : { title: init.title ?? "", list: init.list ?? store.defaultList(), due: init.due ?? null, dueTime: init.dueTime ?? null, repeat: "none", flagged: !!init.flagged, priority: "none", url: "", notes: "" };
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("orc-modal");
    modalEl.addClass("orc-form");
    contentEl.empty();
    if (!this.raw) {
      kindToggle(contentEl, "reminder", () => {
        this.saved = true;
        this.close();
        const e = this.init.eventInit ?? {};
        new EventFormModal(this.app, this.store, { ...e, date: this.v.due ?? e.date ?? todayKey(), startMinutes: this.v.dueTime ?? e.startMinutes ?? null, onCancel: this.init.onCancel }).open();
      });
    }
    contentEl.createEl("h3", { text: this.raw ? "Edit reminder" : "New reminder" });
    const lists = this.store.getLists();

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("New Reminder").setValue(this.v.title).onChange((x) => (this.v.title = x));
      t.inputEl.addClass("orc-wide");
      t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") void this.save(); });
      if (!Platform.isMobile) window.setTimeout(() => t.inputEl.focus(), 50);
    });
    const notesWrap = contentEl.createDiv({ cls: "orc-notes" });
    notesWrap.createDiv({ cls: "setting-item-name", text: "Notes" });
    const notes = notesWrap.createEl("textarea", { cls: "orc-notes-input", attr: { rows: 3, placeholder: "Notes" } });
    notes.addEventListener("input", () => (this.v.notes = notes.value));
    if (this.raw) {
      notes.setAttribute("disabled", "true");
      void this.store.readBody(this.raw).then((b) => { this.originalBody = b; notes.value = b; notes.removeAttribute("disabled"); });
    }

    let dateInput: HTMLInputElement | null = null;
    let timeInput: HTMLInputElement | null = null;
    const dateRow = new Setting(contentEl).setName("Date").addToggle((t) => t.setValue(!!this.v.due).onChange((on) => {
      this.v.due = on ? this.v.due ?? todayKey() : null;
      if (!on) { this.v.dueTime = null; this.v.repeat = "none"; }
      if (dateInput) dateInput.value = this.v.due ?? "";
      show();
    })).addText((t) => {
      t.inputEl.type = "date";
      dateInput = t.inputEl;
      t.setValue(this.v.due ?? "").onChange((x) => { this.v.due = /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : this.v.due; });
    });
    const timeRow = new Setting(contentEl).setName("Time").addToggle((t) => t.setValue(this.v.dueTime != null).onChange((on) => {
      this.v.dueTime = on ? this.v.dueTime ?? 9 * 60 : null;
      if (timeInput) timeInput.value = this.v.dueTime != null ? minutesToHHMM(this.v.dueTime) : "";
      show();
    })).addText((t) => {
      t.inputEl.type = "time";
      timeInput = t.inputEl;
      t.setValue(this.v.dueTime != null ? minutesToHHMM(this.v.dueTime) : "").onChange((x) => { const m = parseTime(x); if (m != null) this.v.dueTime = Math.min(m, 1439); });
    });
    const repeatRow = new Setting(contentEl).setName("Repeat").addDropdown((d) => {
      for (const r of REMINDER_REPEATS) d.addOption(r, RREPEAT_LABELS[r]);
      d.setValue(this.v.repeat).onChange((x) => (this.v.repeat = x as ReminderRepeat));
    });
    const show = () => {
      if (dateInput) dateInput.style.display = this.v.due ? "" : "none";
      if (timeInput) timeInput.style.display = this.v.dueTime != null ? "" : "none";
      timeRow.settingEl.style.display = this.v.due ? "" : "none";
      repeatRow.settingEl.style.display = this.v.due ? "" : "none";
    };
    show();
    void dateRow;

    new Setting(contentEl).setName("Flag").addToggle((t) => t.setValue(this.v.flagged).onChange((x) => (this.v.flagged = x)));
    new Setting(contentEl).setName("Priority").addDropdown((d) => {
      d.addOptions({ none: "None", low: "Low (!)", medium: "Medium (!!)", high: "High (!!!)" });
      d.setValue(this.v.priority).onChange((x) => (this.v.priority = x as Priority));
    });
    const listRow = new Setting(contentEl).setName("List").addDropdown((d) => {
      if (!lists.length) d.addOption("Reminders", "Reminders (new)");
      for (const l of lists) d.addOption(l.name, l.name);
      d.setValue(lists.some((l) => l.name === this.v.list) ? this.v.list : lists[0]?.name ?? "Reminders").onChange((x) => { this.v.list = x; paint(); });
      this.v.list = d.getValue();
    });
    const dot = createDot(listRow.settingEl);
    const paint = () => { dot.style.background = lists.find((l) => l.name === this.v.list)?.color ?? "#007AFF"; };
    paint();
    new Setting(contentEl).setName("URL").addText((t) => {
      t.setPlaceholder("Optional").setValue(this.v.url ?? "").onChange((x) => (this.v.url = x));
      t.inputEl.addClass("orc-wide");
    });
    contentEl.createDiv({ cls: "orc-muted", text: this.v.due ? "Alerts at its date and time (date only: 9 AM) while Obsidian is running." : "No date: it stays in its list and doesn't appear on the calendar." });

    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btns.createEl("button", { text: this.raw ? "Save" : "Add", cls: "mod-cta" }).addEventListener("click", () => void this.save());
  }
  private async save() {
    const v = this.v;
    if (!v.title.trim()) { new Notice("Give the reminder a title."); return; }
    if (v.url && !/^https?:\/\/\S+$/i.test(v.url.trim())) { new Notice("URL must start with http:// or https://"); return; }
    if (!v.due) { v.dueTime = null; v.repeat = "none"; }
    if (this.raw && v.notes != null && v.notes === this.originalBody) v.notes = null;
    try {
      if (this.raw) await this.store.updateReminder(this.raw, v);
      else await this.store.createReminder(v);
      this.saved = true;
      this.close();
    } catch { new Notice("Could not save the reminder."); }
  }
  onClose() { this.contentEl.empty(); if (!this.saved && this.init.onCancel) this.init.onCancel(); }
}

export class ReminderDetailsModal extends Modal {
  constructor(app: App, private r: RawEvent, private store: EventStore) { super(app); }
  onOpen() {
    const { contentEl, modalEl } = this;
    const r = this.r;
    modalEl.addClass("orc-modal");
    contentEl.empty();
    const head = contentEl.createDiv({ cls: "orc-detail-head" });
    const check = head.createDiv({ cls: "orc-rcheck" });
    check.style.setProperty("--cal", r.calendar.color);
    check.toggleClass("is-done", !!r.completed);
    check.addEventListener("click", runAsync(async () => { this.close(); try { await this.store.toggleReminder(r); } catch { new Notice("Could not update the reminder."); } }));
    const t = head.createDiv();
    t.createDiv({ cls: "orc-detail-title", text: r.title + (r.priority && r.priority !== "none" ? "  " + PRIORITY_MARK[r.priority] : "") });
    t.createDiv({ cls: "orc-muted", text: `${r.calendar.name} · Reminder${r.flagged ? " · ⚑ Flagged" : ""}` });
    const when = contentEl.createDiv({ cls: "orc-detail-when" });
    const due = dueLabel(r, (m) => formatTime(m, this.store.hour12()));
    when.createDiv({ text: due || "No date" });
    if (r.reminderRepeat && r.reminderRepeat !== "none") when.createDiv({ cls: "orc-muted", text: "Repeats: " + RREPEAT_LABELS[r.reminderRepeat] });
    if (r.completed) when.createDiv({ cls: "orc-muted", text: "Completed " + String(r.completed).replace("T", " ") });
    if (r.url) when.createDiv({ cls: "orc-muted orc-selectable", text: r.url });
    const notes = contentEl.createDiv({ cls: "orc-detail-notes orc-selectable" });
    void this.store.readBody(r).then((b) => { const x = b.trim(); if (x) notes.setText(x.slice(0, 2000)); });
    const btns = contentEl.createDiv({ cls: "orc-detail-btns" });
    btns.createEl("button", { text: r.completed ? "Mark as not done" : "Mark as done" }).addEventListener("click", runAsync(async () => { this.close(); try { await this.store.toggleReminder(r); } catch { new Notice("Could not update the reminder."); } }));
    btns.createEl("button", { text: "Open note" }).addEventListener("click", () => { this.close(); void this.store.openNote(r); });
    btns.createEl("button", { text: "Delete", cls: "mod-warning" }).addEventListener("click", () => {
      this.close();
      new ConfirmModal(this.app, `Delete "${r.title}"?`, "The note goes to the trash chosen in Obsidian's 'Deleted files' setting.", async () => {
        try { await this.store.deleteEvent(r); } catch { new Notice("Could not delete the reminder."); }
      }).open();
    });
    btns.createEl("button", { text: "Edit", cls: "mod-cta" }).addEventListener("click", () => { this.close(); new ReminderFormModal(this.app, this.store, { raw: r }).open(); });
  }
  onClose() { this.contentEl.empty(); }
}
