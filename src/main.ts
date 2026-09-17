// Syncthing Calendar: Apple-style calendar for Obsidian on top of Full Calendar-format notes.
// Fully local. This plugin never makes a network request.
import {
  App,
  ItemView,
  MarkdownRenderChild,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  WorkspaceLeaf,
  normalizePath,
  Platform,
} from "obsidian";
import {
  Calendar,
  EventInstance,
  PALETTE,
  RawEvent,
  addDays,
  clampKey,
  diffDays,
  expandEvents,
  instanceStart,
  formatTime,
  minutesToHHMM,
  parseFrontmatter,
  todayKey,
} from "./model";
import { CalendarUI, MONTH_STYLES, MonthStyle, MoveChange, UIContext, UIState, ViewKind } from "./ui";
import {
  CalendarModal,
  EventDetailsModal,
  EventFormModal,
  EventFormValues,
  EventStore,
  ExportModal,
  ImportModal,
  SWATCHES,
  ScopeModal,
  SearchModal,
  ConflictsModal,
  ConfirmModal,
  ReminderDetailsModal,
  ReminderFormModal,
  frontmatterFor,
  randomCode,
  renderNoCalendars,
  repeatOf,
  safeName,
  seriesFrontmatter,
} from "./modal";
import { ImportedEvent, toICS } from "./ics";
import { REMINDER_KEYS, REMINDER_RRULE, ReminderValues, nextDue, nowStamp, parseReminder, reminderFrontmatter } from "./reminders";

const HEX = /^#[0-9a-f]{6}$/i;
const VIEWS: ViewKind[] = ["year", "month", "week", "day", "reminders"];
// Frontmatter keys this plugin owns; everything else in a note is left untouched.
const SCHEMA_KEYS = ["title", "allDay", "startTime", "endTime", "type", "date", "endDate", "daysOfWeek", "startRecur", "endRecur", "startDate", "rrule", "skipDates", "location", "url", "alert"];
const EXPORT_FOLDER = "Calendar exports";

interface Settings {
  rootFolder: string;
  colors: Record<string, string>;
  hidden: string[];
  weekStart: 0 | 1;
  hour12: boolean;
  hourHeight: number;
  defaultView: ViewKind;
  opaqueNames: boolean; // name event notes "<date> <random>" so titles never appear in filenames
  defaultCalendar: string; // used for new events and the drag-to-create preview color
  renameOnChange: boolean; // rename notes when their date/title changes (off: names never change after creation)
  monthStyle: MonthStyle; // iPhone month layout (Compact / Stacked / Details / List)
  systemNotifications: boolean; // on desktop, also show alerts as OS notifications (Mac Notification Center)
  remindersFolder: string; // each sub-folder is a reminder list
  listColors: Record<string, string>;
  hiddenLists: string[]; // reminder lists not shown in the calendar
  defaultList: string;
}

const DEFAULT_SETTINGS: Settings = {
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
  defaultList: "",
};

const VIEW_TYPE = "syncthing-calendar-view";
// Apple Reminders list colors.
const REMINDER_PALETTE = ["#007AFF", "#FF9500", "#FF3B30", "#34C759", "#AF52DE", "#FF2D55", "#5AC8FA", "#A2845E"];
const LEGACY_ID = "orchard-calendar"; // earlier name; settings are migrated once

export default class SyncthingCalendarPlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  private rawEvents: RawEvent[] = [];
  private calendars: Calendar[] = [];
  private dirty = true;
  private uis = new Set<CalendarUI>();
  private refreshTimer: number | null = null;
  private sessionView: ViewKind | null = null; // remembered for this session only, never written to disk
  private firedAlerts = new Set<string>();
  private conflicts: TFile[] = []; // Syncthing ".sync-conflict-" copies inside the calendar folder

  async onload() {
    this.settings = sanitizeSettings(((await this.loadData()) as Partial<Settings> | null) ?? (await this.legacySettings()) ?? {});

    this.registerView(VIEW_TYPE, (leaf) => new CalendarView(leaf, this));
    this.addRibbonIcon("calendar", "Open Syncthing Calendar", () => void this.activateView());
    this.addCommand({ id: "open", name: "Open calendar", callback: () => void this.activateView() });
    this.addCommand({ id: "new-event", name: "New event", callback: () => this.openNewEvent({ date: todayKey() }) });
    this.addCommand({ id: "new-calendar", name: "New calendar", callback: () => this.newCalendar() });
    this.addCommand({ id: "search", name: "Search events", callback: () => this.search(null) });
    this.addCommand({ id: "import-ics", name: "Import .ics file", callback: () => new ImportModal(this.app, this.store, () => this.rerenderAll()).open() });
    this.addCommand({ id: "export-ics", name: "Export calendars as .ics", callback: () => new ExportModal(this.app, this.store).open() });
    this.addSettingTab(new CalendarSettingTab(this.app, this));

    // ```syncthing-calendar``` code block embeds the calendar in any note (old ```orchard-calendar``` still works).
    for (const lang of ["syncthing-calendar", "orchard-calendar"]) {
      this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
        ctx.addChild(new CodeBlockChild(el, this, source));
      });
    }

    // Only changes inside the calendar folder trigger a re-render; typing elsewhere costs nothing.
    const invalidate = (file: { path?: string } | string, oldPath?: string) => {
      const p = typeof file === "string" ? file : file?.path ?? "";
      if (this.underRoot(p) || (oldPath && this.underRoot(oldPath))) this.scheduleRefresh();
    };
    this.registerEvent(this.app.metadataCache.on("changed", invalidate));
    this.registerEvent(this.app.vault.on("delete", invalidate));
    this.registerEvent(this.app.vault.on("rename", invalidate));
    this.registerEvent(this.app.vault.on("create", invalidate));
    const catchUp = () => { for (const ui of this.uis) ui.renderIfPending(); };
    this.registerEvent(this.app.workspace.on("layout-change", catchUp));
    this.registerEvent(this.app.workspace.on("active-leaf-change", catchUp));
    this.app.workspace.onLayoutReady(() => this.scheduleRefresh());

    // Alerts: checked every 30 s while Obsidian runs, and right away when it comes back to the
    // foreground (so an alert missed while the app was asleep still shows, marked "Missed").
    this.registerInterval(window.setInterval(() => this.checkAlerts(), 30000));
    this.registerDomEvent(document, "visibilitychange", () => { if (!document.hidden) this.checkAlerts(); });
    this.app.workspace.onLayoutReady(() => this.checkAlerts());
  }

  onunload() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    for (const ui of this.uis) ui.destroy();
    this.uis.clear();
  }

  // One-time: pick up colors/folder from the plugin's earlier id so renaming loses nothing.
  private async legacySettings(): Promise<Partial<Settings> | null> {
    try {
      const { adapter, configDir } = this.app.vault;
      const p = normalizePath(`${configDir}/plugins/${LEGACY_ID}/data.json`);
      if (!(await adapter.exists(p))) return null;
      const old: unknown = JSON.parse(await adapter.read(p));
      return old && typeof old === "object" ? (old as Partial<Settings>) : null;
    } catch {
      return null;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ---------- data ----------

  private rootPath(): string {
    return safeRoot(this.settings.rootFolder);
  }
  // Reminders folder: must not overlap the calendar folder (one can't contain the other).
  remindersPath(): string {
    const cal = this.rootPath();
    let r = safeRoot(this.settings.remindersFolder);
    if (r === cal || r.startsWith(cal + "/") || cal.startsWith(r + "/")) r = cal === "Reminders" ? "Calendar Reminders" : "Reminders";
    return r;
  }
  private underRoot(path: string): boolean {
    const inside = (root: string) => !!root && (path === root || path.startsWith(root + "/"));
    return inside(this.rootPath()) || inside(this.remindersPath());
  }

  private scheduleRefresh() {
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

  private rebuild() {
    const root = this.rootPath();
    const folder = root ? this.app.vault.getAbstractFileByPath(root) : null;
    this.calendars = [];
    this.rawEvents = [];
    this.conflicts = [];
    this.rebuildReminders();
    if (!root || !(folder instanceof TFolder)) {
      this.dirty = false;
      return;
    }
    const subs = folder.children.filter((c): c is TFolder => c instanceof TFolder).sort((a, b) => a.name.localeCompare(b.name));
    subs.forEach((f, i) => {
      const custom = Object.prototype.hasOwnProperty.call(this.settings.colors, f.name) ? this.settings.colors[f.name] : "";
      this.calendars.push({ name: f.name, path: f.path, color: HEX.test(custom) ? custom : PALETTE[i % PALETTE.length] });
    });
    // Forget colors / hidden flags of calendars that no longer exist (no stale names in data.json).
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
      // Syncthing conflict copies are not shown as events (they'd duplicate), but they're listed so
      // you can pick the right version.
      if (/\.sync-conflict-\d{8}-\d{6}-/.test(file.basename)) { this.conflicts.push(file); continue; }
      const rel = file.path.slice(root.length + 1);
      const top = rel.split("/")[0];
      const cal = byPath.get(`${root}/${top}`);
      if (!cal || rel.indexOf("/") === -1) continue; // notes directly in root are not events
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const ev = parseFrontmatter(fm, file.path, file.basename, cal);
      if (ev) {
        ev.file = file; // keep the live TFile so a later rename cannot make us touch the wrong note
        this.rawEvents.push(ev);
      }
    }
    this.dirty = false;
  }

  private lists: Calendar[] = [];
  private reminders: RawEvent[] = [];
  private rebuildReminders() {
    this.lists = [];
    this.reminders = [];
    const root = this.remindersPath();
    const folder = this.app.vault.getAbstractFileByPath(root);
    if (!(folder instanceof TFolder)) return;
    const subs = folder.children.filter((c): c is TFolder => c instanceof TFolder).sort((a, b) => a.name.localeCompare(b.name));
    subs.forEach((f, i) => {
      const custom = Object.prototype.hasOwnProperty.call(this.settings.listColors, f.name) ? this.settings.listColors[f.name] : "";
      this.lists.push({ name: f.name, path: f.path, color: HEX.test(custom) ? custom : REMINDER_PALETTE[i % REMINDER_PALETTE.length] });
    });
    const byPath = new Map(this.lists.map((c) => [c.path, c]));
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(root + "/")) continue;
      if (/\.sync-conflict-\d{8}-\d{6}-/.test(file.basename)) { this.conflicts.push(file); continue; }
      const rel = file.path.slice(root.length + 1);
      const list = byPath.get(`${root}/${rel.split("/")[0]}`);
      if (!list || rel.indexOf("/") === -1) continue;
      const r = parseReminder(this.app.metadataCache.getFileCache(file)?.frontmatter, file.path, file.basename, list);
      if (r) { r.file = file; this.reminders.push(r); }
    }
  }

  getCalendars(): Calendar[] {
    if (this.dirty) this.rebuild();
    return this.calendars;
  }
  getLists(): Calendar[] {
    if (this.dirty) this.rebuild();
    return this.lists;
  }
  getReminders(): RawEvent[] {
    if (this.dirty) this.rebuild();
    return this.reminders;
  }

  getInstances(from: string, to: string): EventInstance[] {
    if (this.dirty) this.rebuild();
    const hidden = new Set(this.settings.hidden);
    const hiddenLists = new Set(this.settings.hiddenLists);
    const events = this.rawEvents.filter((r) => !hidden.has(r.calendar.name));
    // Open repeating reminders also appear on every future date they repeat on (from the due date on).
    const rems = this.reminders.filter((r) => r.date && !hiddenLists.has(r.calendar.name))
      .map((r) => (!r.completed && r.reminderRepeat && r.reminderRepeat !== "none" ? { ...r, type: "rrule" as const, startDate: r.date, rrule: REMINDER_RRULE[r.reminderRepeat], skipDates: [] } : r));
    return expandEvents(events.length && rems.length ? [...events, ...rems] : events.length ? events : rems, from, to);
  }

  private defaultCalendar(): Calendar | undefined {
    const cals = this.getCalendars().filter((c) => !this.settings.hidden.includes(c.name));
    const all = this.getCalendars();
    return all.find((c) => c.name === this.settings.defaultCalendar) ?? cals[0] ?? all[0];
  }

  // ---------- note helpers ----------

  // The note behind an event, following renames, but only while it is still inside the calendar
  // folder: a note that sync moved elsewhere is never edited, moved back, or deleted from here.
  private liveFile(raw: RawEvent): TFile | null {
    const f = raw.file instanceof TFile ? raw.file : this.app.vault.getAbstractFileByPath(raw.path);
    return f instanceof TFile && this.app.vault.getAbstractFileByPath(f.path) === f && this.underRoot(f.path) ? f : null;
  }

  // Current frontmatter of the note (sync may have changed it since the view was drawn).
  private freshRaw(raw: RawEvent): RawEvent | null {
    const file = this.liveFile(raw);
    if (!file) return null;
    if (raw.kind === "reminder") {
      const list = this.getLists().find((c) => file.path.startsWith(c.path + "/")) ?? raw.calendar;
      const r = parseReminder(this.app.metadataCache.getFileCache(file)?.frontmatter, file.path, file.basename, list);
      if (r) r.file = file;
      return r;
    }
    const cal = this.getCalendars().find((c) => file.path.startsWith(c.path + "/")) ?? raw.calendar;
    const ev = parseFrontmatter(this.app.metadataCache.getFileCache(file)?.frontmatter, file.path, file.basename, cal);
    if (ev) ev.file = file;
    return ev;
  }

  private async uniquePath(folder: string, basename: string, allow?: string): Promise<string> {
    let path = `${folder}/${basename}.md`;
    let i = 2;
    while (path !== allow && this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${basename} ${i++}.md`;
    return path;
  }

  private async readBody(file: TFile): Promise<string> {
    return splitNote(await this.app.vault.read(file)).body;
  }

  private async writeBody(file: TFile, body: string) {
    const vault = this.app.vault as unknown as { process?: (f: TFile, fn: (t: string) => string) => Promise<string> };
    const swap = (t: string) => splitNote(t).head + body;
    if (typeof vault.process === "function") await vault.process(file, swap); // atomic in Obsidian 1.1+
    else await this.app.vault.modify(file, swap(await this.app.vault.read(file)));
  }

  private async createNote(cal: Calendar, fm: Record<string, unknown>, basename: string, body = "") {
    const path = await this.uniquePath(cal.path, basename);
    await this.app.vault.create(path, `---\n${toYaml(fm)}---\n${body}`);
  }

  private async writeFrontmatter(file: TFile, fm: Record<string, unknown>) {
    await this.app.fileManager.processFrontMatter(file, (cur) => {
      for (const k of SCHEMA_KEYS) delete cur[k];
      Object.assign(cur, fm);
    });
  }

  // Move the note into the target calendar folder. By default a note keeps the name it was created
  // with: renaming on every date change looks like "delete + new file" to Syncthing, and if another
  // device edits the old name before syncing, both files survive and the event shows up twice.
  // With "Rename notes when dates change" on, the date/rule prefix of plugin-made names is refreshed.
  private async placeNote(file: TFile, cal: Calendar, basename: string) {
    const generated = /^(\d{4}-\d{2}-\d{2}|\([^)]*\)) (.+)$/.exec(file.basename);
    let newBase = file.basename;
    if (generated && this.settings.renameOnChange) {
      const prefix = /^(\d{4}-\d{2}-\d{2}|\([^)]*\))/.exec(basename)?.[1] ?? generated[1];
      newBase = this.settings.opaqueNames ? `${prefix} ${generated[2]}` : basename;
    }
    const target = `${cal.path}/${newBase}.md`;
    if (target !== file.path) {
      const dest = await this.uniquePath(cal.path, newBase, file.path);
      await this.app.fileManager.renameFile(file, dest);
    }
  }

  private async addSkipDate(raw: RawEvent, date: string) {
    const file = this.liveFile(raw);
    if (!file) throw new Error("Note not found");
    await this.app.fileManager.processFrontMatter(file, (cur) => {
      const list: string[] = Array.isArray(cur.skipDates) ? cur.skipDates.map(String) : [];
      if (list.length >= 4000) throw new Error("SC:This repeating event has too many exceptions. Split it into a new series.");
      if (!list.includes(date)) list.push(date);
      cur.skipDates = list.sort();
    });
  }

  private async trash(f: TAbstractFile) {
    await this.app.fileManager.trashFile(f);
  }

  private valuesFrom(raw: RawEvent): EventFormValues {
    const rep = repeatOf(raw);
    return {
      title: raw.title, calendar: raw.calendar.name,
      date: raw.type === "single" ? raw.date! : raw.type === "recurring" ? raw.startRecur ?? todayKey() : raw.startDate!,
      endDate: raw.type === "single" ? raw.endDate ?? null : null,
      allDay: raw.allDay, startTime: raw.startTime, endTime: raw.endTime,
      repeat: rep.repeat, repeatUntil: rep.until,
      location: raw.location, url: raw.url, alerts: [...raw.alerts], notes: null,
    };
  }

  // ---------- event store ----------

  store: EventStore = {
    getCalendars: () => this.getCalendars(),
    getInstances: (a, b) => this.getInstances(a, b),
    rootFolder: () => this.rootPath(),
    hour12: () => this.settings.hour12,
    countEvents: (name) => { this.getCalendars(); return this.rawEvents.filter((r) => r.calendar.name === name).length; },
    folderContents: (name) => {
      const folder = this.app.vault.getAbstractFileByPath(`${this.rootPath()}/${name}`);
      this.getCalendars();
      const eventPaths = new Set(this.rawEvents.filter((r) => r.calendar.name === name).map((r) => (r.file instanceof TFile ? r.file.path : r.path)));
      let events = 0, other = 0;
      const walk = (n: TAbstractFile) => {
        if (n instanceof TFolder) n.children.forEach(walk);
        else if (eventPaths.has(n.path)) events++;
        else other++;
      };
      if (folder) walk(folder);
      return { events, other };
    },
    searchInstances: (query, from, to) => {
      // Match notes first, expand only the matches, and cap the result: a vault with thousands of
      // daily events can't freeze the search box.
      this.getCalendars();
      const q = query.trim().toLowerCase();
      const hidden = new Set(this.settings.hidden);
      const hits = this.rawEvents.filter((r) => !hidden.has(r.calendar.name) && (r.title.toLowerCase().includes(q) || (r.location ?? "").toLowerCase().includes(q) || r.calendar.name.toLowerCase().includes(q)));
      const out: EventInstance[] = [];
      for (const r of hits) {
        for (const i of expandEvents([r], from, to)) { out.push(i); if (out.length >= 5000) return { items: out, truncated: true }; }
      }
      return { items: out, truncated: false };
    },

    createCalendar: async (name, color) => {
      const root = this.rootPath();
      if (!this.app.vault.getAbstractFileByPath(root)) await this.app.vault.createFolder(root);
      const sub = `${root}/${name}`;
      if (!this.app.vault.getAbstractFileByPath(sub)) await this.app.vault.createFolder(sub);
      if (HEX.test(color)) this.settings.colors[name] = color;
      await this.saveSettings();
      this.scheduleRefresh();
    },
    renameCalendar: async (oldName, newName) => {
      const root = this.rootPath();
      const folder = this.app.vault.getAbstractFileByPath(`${root}/${oldName}`);
      if (!(folder instanceof TFolder)) throw new Error("Calendar not found");
      await this.app.fileManager.renameFile(folder, `${root}/${newName}`);
      if (Object.prototype.hasOwnProperty.call(this.settings.colors, oldName)) {
        this.settings.colors[newName] = this.settings.colors[oldName];
        delete this.settings.colors[oldName];
      }
      this.settings.hidden = this.settings.hidden.map((h) => (h === oldName ? newName : h));
      if (this.settings.defaultCalendar === oldName) this.settings.defaultCalendar = newName;
      await this.saveSettings();
      this.scheduleRefresh();
    },
    setCalendarColor: async (name, color) => {
      if (!HEX.test(color)) return;
      this.settings.colors[name] = color;
      await this.saveSettings();
      this.rerenderAll();
    },
    deleteCalendar: async (name) => {
      const folder = this.app.vault.getAbstractFileByPath(`${this.rootPath()}/${name}`);
      if (!(folder instanceof TFolder)) throw new Error("Calendar not found");
      if (this.store.folderContents(name).other > 0) throw new Error("SC:This folder also holds files that aren't events. Move them out first, or delete the folder yourself.");
      await this.trash(folder);
      delete this.settings.colors[name];
      this.settings.hidden = this.settings.hidden.filter((h) => h !== name);
      if (this.settings.defaultCalendar === name) this.settings.defaultCalendar = "";
      await this.saveSettings();
      this.scheduleRefresh();
    },

    createEvent: async (v) => {
      const cal = this.getCalendars().find((c) => c.name === v.calendar);
      if (!cal) throw new Error("Calendar not found");
      const { fm, basename } = frontmatterFor(v, undefined, this.settings.opaqueNames);
      await this.createNote(cal, fm, basename, v.notes ?? "");
      this.scheduleRefresh();
    },
    updateEvent: async (raw, v, instanceDate) => {
      const file = this.liveFile(raw);
      if (!file) throw new Error("Note not found");
      const cal = this.getCalendars().find((c) => c.name === v.calendar);
      if (!cal) throw new Error("Calendar not found");
      let res: { fm: Record<string, unknown>; basename: string } | null;
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
      // "This event only": hide this occurrence in the series and create a one-off event for it.
      const cal = this.getCalendars().find((c) => c.name === v.calendar);
      if (!cal) throw new Error("Calendar not found");
      const file = this.liveFile(raw);
      if (!file) throw new Error("Note not found");
      const body = v.notes ?? (await this.readBody(file));
      const { fm, basename } = frontmatterFor({ ...v, repeat: "none", repeatUntil: null }, undefined, this.settings.opaqueNames);
      await this.createNote(cal, fm, basename, body); // first, so a failure never just hides the occurrence
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
      const file = this.liveFile(raw);
      if (!file) throw new Error("Note not found");
      const content = await this.app.vault.read(file);
      const folder = raw.calendar.path;
      const prefix = /^(\d{4}-\d{2}-\d{2}|\([^)]*\))/.exec(file.basename)?.[1];
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
    defaultList: () => (this.getLists().find((l) => l.name === this.settings.defaultList) ?? this.getLists().find((l) => l.name === "Reminders") ?? this.getLists()[0])?.name ?? "",
    createReminder: async (v: ReminderValues) => {
      let list = this.getLists().find((l) => l.name === v.list);
      if (!list) {
        // First reminder ever: make a "Reminders" list so it has somewhere to live.
        await this.store.createList(v.list || "Reminders", "#007AFF");
        this.rebuild();
        list = this.getLists().find((l) => l.name === (v.list || "Reminders"));
        if (!list) throw new Error("List not found");
      }
      const fm = reminderFrontmatter(v, nowStamp());
      await this.createNote(list, fm, `${v.due ?? todayKey()} ${safeName(v.title)}`, v.notes ?? "");
      this.scheduleRefresh();
    },
    updateReminder: async (raw: RawEvent, v: ReminderValues) => {
      const file = this.liveFile(raw);
      if (!file) throw new Error("Note not found");
      const list = this.getLists().find((l) => l.name === v.list);
      if (!list) throw new Error("List not found");
      const fm = reminderFrontmatter(v, raw.created ?? nowStamp());
      delete fm.completed; // editing never changes done/not done
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
    toggleReminder: async (raw: RawEvent) => {
      const fresh = this.freshRaw(raw);
      const file = fresh ? this.liveFile(fresh) : null;
      if (!fresh || !file) throw new Error("Note not found");
      if (fresh.completed) {
        await this.app.fileManager.processFrontMatter(file, (cur) => { cur.completed = false; });
      } else if (fresh.reminderRepeat && fresh.reminderRepeat !== "none" && fresh.date) {
        const done = nowStamp();
        const copy = reminderFrontmatter({ title: fresh.title, list: fresh.calendar.name, due: fresh.date, dueTime: fresh.startTime, repeat: "none", flagged: !!fresh.flagged, priority: fresh.priority ?? "none", url: fresh.url }, fresh.created ?? done);
        copy.completed = done;
        await this.createNote(fresh.calendar, copy, `${fresh.date} ${safeName(fresh.title)}`, await this.readBody(file));
        const next = nextDue(fresh.date, fresh.reminderRepeat);
        await this.app.fileManager.processFrontMatter(file, (cur) => { cur.due = next; cur.completed = false; });
      } else {
        await this.app.fileManager.processFrontMatter(file, (cur) => { cur.completed = nowStamp(); });
      }
      this.scheduleRefresh();
    },
    clearCompleted: async (listName: string | null) => {
      const done = this.getReminders().filter((r) => r.completed && (listName == null || r.calendar.name === listName));
      for (const r of done) { const f = this.liveFile(r); if (f) await this.trash(f); }
      this.scheduleRefresh();
      return done.length;
    },
    createList: async (name: string, color: string) => {
      const root = this.remindersPath();
      if (!this.app.vault.getAbstractFileByPath(root)) await this.app.vault.createFolder(root);
      if (!this.app.vault.getAbstractFileByPath(`${root}/${name}`)) await this.app.vault.createFolder(`${root}/${name}`);
      if (HEX.test(color)) this.settings.listColors[name] = color;
      await this.saveSettings();
      this.scheduleRefresh();
    },
    renameList: async (oldName: string, newName: string) => {
      const root = this.remindersPath();
      const folder = this.app.vault.getAbstractFileByPath(`${root}/${oldName}`);
      if (!(folder instanceof TFolder)) throw new Error("List not found");
      await this.app.fileManager.renameFile(folder, `${root}/${newName}`);
      if (Object.prototype.hasOwnProperty.call(this.settings.listColors, oldName)) { this.settings.listColors[newName] = this.settings.listColors[oldName]; delete this.settings.listColors[oldName]; }
      this.settings.hiddenLists = this.settings.hiddenLists.map((h) => (h === oldName ? newName : h));
      if (this.settings.defaultList === oldName) this.settings.defaultList = newName;
      await this.saveSettings();
      this.scheduleRefresh();
    },
    setListColor: async (name: string, color: string) => {
      if (!HEX.test(color)) return;
      this.settings.listColors[name] = color;
      await this.saveSettings();
      this.rerenderAll();
    },
    deleteList: async (name: string) => {
      const folder = this.app.vault.getAbstractFileByPath(`${this.remindersPath()}/${name}`);
      if (!(folder instanceof TFolder)) throw new Error("List not found");
      if (this.store.listContents(name).other > 0) throw new Error("SC:This folder also holds files that aren't reminders. Move them out first, or delete the folder yourself.");
      await this.trash(folder);
      delete this.settings.listColors[name];
      this.settings.hiddenLists = this.settings.hiddenLists.filter((h) => h !== name);
      await this.saveSettings();
      this.scheduleRefresh();
    },
    listContents: (name: string) => {
      const folder = this.app.vault.getAbstractFileByPath(`${this.remindersPath()}/${name}`);
      const paths = new Set(this.getReminders().filter((r) => r.calendar.name === name).map((r) => (r.file instanceof TFile ? r.file.path : r.path)));
      let events = 0, other = 0;
      const walk = (n: TAbstractFile) => { if (n instanceof TFolder) n.children.forEach(walk); else if (paths.has(n.path)) events++; else other++; };
      if (folder) walk(folder);
      return { events, other };
    },
    isListHidden: (name: string) => this.settings.hiddenLists.includes(name),
    setListHidden: (name: string, hidden: boolean) => {
      this.settings.hiddenLists = this.settings.hiddenLists.filter((x) => x !== name);
      if (hidden) this.settings.hiddenLists.push(name);
      void this.saveSettings();
      this.rerenderAll();
    },

    exportCalendars: async (names) => {
      this.getCalendars();
      const pick = names ? this.rawEvents.filter((r) => names.includes(r.calendar.name)) : this.rawEvents; // reminders are not exported as events
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
      if (existing instanceof TFile) await this.app.vault.modify(existing, text);
      else await this.app.vault.create(path, text);
      return path;
    },
    importEvents: async (events, calendarName) => {
      const cal = this.getCalendars().find((c) => c.name === calendarName);
      if (!cal) throw new Error("Calendar not found");
      const seen = new Set(this.rawEvents.filter((r) => r.calendar.name === calendarName).map((r) => dupKey(r.title, r.date ?? r.startDate ?? r.startRecur ?? "", r.startTime)));
      let created = 0, duplicates = 0;
      for (const e of events) {
        const k = dupKey(e.title, e.date, e.startTime);
        if (seen.has(k)) { duplicates++; continue; }
        seen.add(k);
        const { fm, basename } = importedFrontmatter(e, this.settings.opaqueNames);
        await this.createNote(cal, fm, basename, e.notes ?? "");
        created++;
      }
      this.scheduleRefresh();
      return { created, duplicates };
    },
  };

  // ---------- UI actions ----------

  openNewEvent(init: { date: string; start?: number | null; end?: number | null; allDay?: boolean; endDate?: string; onCancel?: () => void }) {
    new EventFormModal(this.app, this.store, {
      date: init.date, startMinutes: init.start ?? null, endMinutes: init.end ?? null, allDay: init.allDay, endDate: init.endDate ?? null,
      defaultCalendar: this.defaultCalendar()?.name, onCancel: init.onCancel,
    }).open();
  }

  newCalendar() {
    const used = new Set(this.getCalendars().map((c) => c.color.toUpperCase()));
    const suggested = SWATCHES.find((c) => !used.has(c.toUpperCase())) ?? SWATCHES[0];
    new CalendarModal(this.app, this.store, null, () => this.rerenderAll(), suggested).open();
  }

  newList() {
    const used = new Set(this.getLists().map((c) => c.color.toUpperCase()));
    const suggested = REMINDER_PALETTE.find((c) => !used.has(c.toUpperCase())) ?? REMINDER_PALETTE[0];
    new CalendarModal(this.app, this.store, null, () => this.rerenderAll(), suggested, "list").open();
  }

  search(ui: CalendarUI | null) {
    new SearchModal(this.app, this.store, (date) => {
      if (ui) ui.goTo(date, "day");
      else void this.activateView().then(() => { for (const u of this.uis) u.goTo(date, "day"); });
    }).open();
  }

  // Drag-and-drop result from the UI. Single events move directly; repeating events ask
  // "This event only / All events" like Apple Calendar. Cancelling redraws the original spot.
  async moveInstance(inst: EventInstance, change: MoveChange) {
    const unchanged = change.dayDelta === 0 && (change.start == null || (change.start === inst.start && change.end === inst.end));
    if (unchanged) return;
    const fail = (e: unknown) => {
      new Notice((e as Error)?.message?.startsWith("SC:") ? (e as Error).message.slice(3) : "Could not move the event.");
      this.rerenderAll();
    };
    // Re-read the note: sync may have changed it while the finger was down. Only date/time
    // (and, for "All events", the repeat rule) are written, so other edits are never reverted.
    const raw = this.freshRaw(inst.raw);
    const file = raw ? this.liveFile(raw) : null;
    if (!raw || !file) return fail(new Error("SC:That event's note changed or moved. Try again."));
    const timed = change.start != null && change.end != null && !inst.allDay && !raw.allDay;
    if (raw.kind === "reminder") {
      // Reminders have one date and an optional time; moving changes just those.
      try {
        const patch: Record<string, unknown> = { due: addDays(raw.date!, change.dayDelta) };
        if (timed) patch.dueTime = minutesToHHMM(change.start!);
        await this.app.fileManager.processFrontMatter(file, (cur) => Object.assign(cur, patch));
        this.scheduleRefresh();
      } catch (e) { fail(e); }
      return;
    }
    const times: Record<string, unknown> = timed ? { startTime: minutesToHHMM(change.start!), endTime: minutesToHHMM(change.end!) } : {};
    const newDate = addDays(inst.date, change.dayDelta);

    if (raw.type === "single") {
      try {
        const patch: Record<string, unknown> = { ...times, date: addDays(raw.date!, change.dayDelta) };
        if (raw.endDate) patch.endDate = addDays(raw.endDate, change.dayDelta);
        await this.app.fileManager.processFrontMatter(file, (cur) => Object.assign(cur, patch));
        await this.placeNote(file, raw.calendar, `${patch.date as string} ${safeName(raw.title)}`);
        this.scheduleRefresh();
      } catch (e) { fail(e); }
      return;
    }
    new ScopeModal(this.app, `Move "${raw.title}"`, "This is a repeating event.", "This event only", "All events", async (scope) => {
      try {
        const v = this.valuesFrom(raw);
        if (timed) { v.startTime = change.start!; v.endTime = change.end!; }
        if (scope === "this") {
          await this.store.updateOccurrence(raw, inst.date, { ...v, date: newDate, endDate: null, repeat: "none", repeatUntil: null });
          return;
        }
        const res = seriesFrontmatter(raw, { ...v, date: newDate }, change.dayDelta, this.settings.opaqueNames);
        if (!res) throw new Error("SC:This repeat rule can't be moved by days. Use 'This event only', or edit the rule in the note.");
        const RULE_KEYS = ["type", "daysOfWeek", "startRecur", "endRecur", "startDate", "rrule", "skipDates"];
        await this.app.fileManager.processFrontMatter(file, (cur) => {
          for (const k of RULE_KEYS) delete cur[k];
          for (const k of RULE_KEYS) if (res.fm[k] !== undefined) cur[k] = res.fm[k];
          Object.assign(cur, times);
        });
        await this.placeNote(file, raw.calendar, res.basename);
        this.scheduleRefresh();
      } catch (e) { fail(e); }
    }, false, () => this.rerenderAll()).open();
  }

  checkAlerts() {
    this.getCalendars();
    const hidden = new Set(this.settings.hidden);
    // Reminders alert at their due time even when their list is hidden from the calendar, like Apple.
    const withAlert = [...this.rawEvents.filter((r) => r.alerts.length && !hidden.has(r.calendar.name)), ...this.reminders.filter((r) => r.alerts.length && r.date && !r.completed)];
    if (!withAlert.length) return;
    const now = Date.now();
    const today = todayKey();
    const maxAlert = withAlert.reduce((m, r) => Math.max(m, r.alerts[0] ?? 0), 0);
    const lead = Math.min(28, Math.ceil(maxAlert / 1440) + 1);
    const due: { inst: EventInstance; missed: boolean }[] = [];
    for (const inst of expandEvents(withAlert, addDays(today, -1), addDays(today, lead))) {
      for (const a of inst.raw.alerts) {
        const fire = instanceStart(inst).getTime() - a * 60000;
        const key = `${inst.raw.path}|${inst.date}|${a}`;
        // Each alert fires once. Up to an hour late still counts (app was asleep or closed) and is
        // marked "Missed"; anything older is skipped so there's no backlog on startup.
        if (fire <= now && now - fire < 60 * 60000 && !this.firedAlerts.has(key)) {
          this.firedAlerts.add(key);
          due.push({ inst, missed: now - fire > 2 * 60000 });
        }
      }
    }
    for (const { inst, missed } of due.slice(0, 3)) {
      const when = inst.allDay ? "all day" : formatTime(inst.start, this.settings.hour12);
      const day = inst.date === today ? "today" : inst.date;
      new Notice(`${missed ? "Missed reminder" : "Reminder"}: ${inst.title} — ${day}, ${when}`, 0);
      this.systemNotify(inst.title, `${missed ? "Missed · " : ""}${day}, ${when}${inst.raw.location ? " · " + inst.raw.location : ""}`);
    }
    if (due.length > 3) new Notice(`Reminder: ${due.length - 3} more events are starting soon`, 0);
    if (this.firedAlerts.size > 2000) this.firedAlerts.clear();
  }

  // Mac/desktop: a normal system notification (Notification Center), created locally by the app.
  // Not available on iPhone/iPad, where the Obsidian popup is the only alert.
  private systemNotify(title: string, body: string) {
    if (!this.settings.systemNotifications || Platform.isMobile) return;
    const N = (window as unknown as { Notification?: { new (t: string, o?: { body?: string; silent?: boolean }): unknown; permission?: string } }).Notification;
    if (!N || N.permission === "denied") return;
    try { new N(title, { body, silent: false }); } catch { /* notifications unavailable: the popup already showed */ }
  }

  // ---------- UI wiring ----------

  mountUI(container: HTMLElement, initial?: Partial<UIState>): CalendarUI {
    const state: UIState = {
      view: initial?.view ?? this.sessionView ?? this.settings.defaultView,
      cursor: clampKey(initial?.cursor ?? todayKey()),
    };
    let ui: CalendarUI;
    const ctx: UIContext = {
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
      setMonthStyle: (m) => { this.settings.monthStyle = m; void this.saveSettings(); this.rerenderAll(); },
      getLists: () => this.getLists(),
      getReminders: () => this.getReminders(),
      isListHidden: (n) => this.settings.hiddenLists.includes(n),
      setListHidden: (n, h) => this.store.setListHidden(n, h),
      toggleReminder: (r) => { this.store.toggleReminder(r).catch(() => new Notice("Could not update the reminder.")); },
      openReminder: (r) => new ReminderDetailsModal(this.app, r, this.store).open(),
      newReminder: (init) => new ReminderFormModal(this.app, this.store, { list: init.list, due: init.due ?? null, flagged: init.flagged }).open(),
      quickAddReminder: async (title, list, due, flagged) => {
        try {
          await this.store.createReminder({ title, list: list ?? this.store.defaultList(), due, dueTime: null, repeat: "none", flagged, priority: "none", url: "", notes: "" });
        } catch { new Notice("Could not add the reminder."); }
      },
      newList: () => this.newList(),
      editList: (c) => new CalendarModal(this.app, this.store, c, () => this.rerenderAll(), c.color, "list").open(),
      clearCompleted: (list) => {
        const n = this.getReminders().filter((r) => r.completed && (list == null || r.calendar.name === list)).length;
        if (!n) return;
        new ConfirmModal(this.app, `Clear ${n} completed reminder${n === 1 ? "" : "s"}?`, "The notes go to the trash chosen in Obsidian's 'Deleted files' setting.", async () => {
          try { await this.store.clearCompleted(list); } catch { new Notice("Could not clear completed reminders."); }
        }, "Clear").open();
      },
      createEvent: (date, start, end, onCancel, allDay, endDate) => this.openNewEvent({ date, start, end, onCancel, allDay, endDate }),
      moveEvent: (inst, change) => void this.moveInstance(inst, change),
      newCalendarColor: () => this.defaultCalendar()?.color ?? "#007AFF",
      conflictCount: () => { this.getCalendars(); return this.conflicts.length; },
      showConflicts: () => { this.getCalendars(); new ConflictsModal(this.app, this.conflicts, (f) => void this.app.workspace.getLeaf(false).openFile(f)).open(); },
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
        this.sessionView = s.view; // memory only: browsing history is never written to disk or synced
      },
    };
    ui = new CalendarUI(container, ctx);
    this.uis.add(ui);
    return ui;
  }

  unmountUI(ui: CalendarUI) {
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
}

// The calendar folder must be a real sub-folder: never the vault root, a hidden/config folder,
// or a path with ".." segments. Anything else falls back to "Calendar".
export function safeRoot(v: unknown): string {
  const p = normalizePath(typeof v === "string" ? v.trim() : "");
  const segs = p.split("/");
  if (!p || p === "/" || segs.some((x) => !x || x === "." || x === ".." || x.startsWith("."))) return "Calendar";
  return p;
}

function dupKey(title: string, date: string, start: number | null): string {
  return `${title.trim().toLowerCase()}|${date}|${start ?? "allday"}`;
}

// Split a note into its frontmatter block (kept verbatim) and body.
export function splitNote(text: string): { head: string; body: string } {
  // Optional BOM; the closing line must be exactly "---" (trailing spaces allowed).
  const m = /^\uFEFF?---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? { head: m[0].endsWith("\n") ? m[0] : m[0] + "\n", body: text.slice(m[0].length) } : { head: "", body: text };
}

function importedFrontmatter(e: ImportedEvent, opaque: boolean): { fm: Record<string, unknown>; basename: string } {
  const fm: Record<string, unknown> = { title: e.title };
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const hm = (m: number) => `${pad2(Math.floor(Math.min(m, 1439) / 60))}:${pad2(Math.min(m, 1439) % 60)}`;
  if (e.allDay) fm.allDay = true;
  else {
    fm.allDay = false;
    fm.startTime = hm(e.startTime!);
    if (e.endTime != null && e.endTime > e.startTime!) fm.endTime = hm(e.endTime);
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
    const freq = /FREQ=(\w+)/i.exec(e.rrule)?.[1]?.toLowerCase() ?? "custom";
    return { fm, basename: `(repeats ${freq}) ${name}` };
  }
  fm.type = "single";
  fm.date = e.date;
  if (e.endDate) fm.endDate = e.endDate;
  return { fm, basename: `${e.date} ${name}` };
}

class CalendarView extends ItemView {
  private ui: CalendarUI | null = null;
  constructor(leaf: WorkspaceLeaf, private plugin: SyncthingCalendarPlugin) {
    super(leaf);
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Calendar"; }
  getIcon() { return "calendar"; }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("orc-view-content");
    this.ui = this.plugin.mountUI(this.contentEl);
  }
  async onClose() {
    if (this.ui) this.plugin.unmountUI(this.ui);
    this.ui = null;
  }
}

class CodeBlockChild extends MarkdownRenderChild {
  private ui: CalendarUI | null = null;
  constructor(el: HTMLElement, private plugin: SyncthingCalendarPlugin, private source: string) {
    super(el);
  }
  onload() {
    const opts = parseOptions(this.source);
    this.containerEl.addClass("orc-embed");
    this.containerEl.style.height = opts.height ?? "70vh";
    this.ui = this.plugin.mountUI(this.containerEl, { view: opts.view });
  }
  onunload() {
    if (this.ui) this.plugin.unmountUI(this.ui);
    this.ui = null;
  }
}

// Options inside the code block, one per line: `view: week`, `height: 600px`.
function parseOptions(src: string): { view?: ViewKind; height?: string } {
  const out: { view?: ViewKind; height?: string } = {};
  for (const line of src.split(/\r?\n/).slice(0, 20)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().slice(0, 20);
    if (k === "view" && (VIEWS as string[]).includes(v)) out.view = v as ViewKind;
    if (k === "height") {
      const m = v.match(/^(\d{2,4})(px|vh|%)?$/);
      if (m) out.height = m[1] + (m[2] ?? "px");
    }
  }
  return out;
}

function toYaml(obj: Record<string, unknown>): string {
  let s = "";
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) s += `${k}: [${v.map(yamlAtom).join(", ")}]\n`;
    else s += `${k}: ${yamlAtom(v)}\n`;
  }
  return s;
}
function yamlAtom(v: unknown): string {
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const str = String(v);
  // Dates and times are written bare, exactly like Full Calendar does; other risky strings get quoted.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str) || /^\d{2}:\d{2}$/.test(str)) return str;
  const plain = /^[A-Za-z][A-Za-z0-9 _.,'()!-]*$/.test(str) && !/^(true|false|null|yes|no|on|off)$/i.test(str) && !/\s$/.test(str);
  return plain ? str : JSON.stringify(str);
}

class CalendarSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SyncthingCalendarPlugin) {
    super(app, plugin);
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const redraw = () => this.plugin.rerenderAll();
    new Setting(containerEl).setName(`Syncthing Calendar v${this.plugin.manifest.version}`).setHeading();

    new Setting(containerEl)
      .setName("Calendar folder")
      .setDesc("Each sub-folder inside it is one calendar; each note inside a sub-folder is one event (Full Calendar format).")
      .addText((t) => t.setValue(s.rootFolder).setPlaceholder("Calendar").onChange(async (v) => { s.rootFolder = safeRoot(v); await this.plugin.saveSettings(); redraw(); }));
    new Setting(containerEl).setName("Default calendar").setDesc("Used for new events and the drag-to-create preview color.").addDropdown((d) => {
      d.addOption("", "First visible calendar");
      for (const c of this.plugin.getCalendars()) d.addOption(c.name, c.name);
      d.setValue(s.defaultCalendar).onChange(async (v) => { s.defaultCalendar = v; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Week starts on").addDropdown((d) =>
      d.addOptions({ "0": "Sunday", "1": "Monday" }).setValue(String(s.weekStart)).onChange(async (v) => { s.weekStart = v === "1" ? 1 : 0; await this.plugin.saveSettings(); })
    );
    new Setting(containerEl).setName("12-hour clock").addToggle((t) =>
      t.setValue(s.hour12).onChange(async (v) => { s.hour12 = v; await this.plugin.saveSettings(); })
    );
    new Setting(containerEl).setName("Default view").addDropdown((d) =>
      d.addOptions({ year: "Year", month: "Month", week: "Week", day: "Day", reminders: "Reminders" }).setValue(s.defaultView).onChange(async (v) => { s.defaultView = v as ViewKind; await this.plugin.saveSettings(); })
    );
    new Setting(containerEl)
      .setName("Private filenames")
      .setDesc("Name new event notes \"<date> <random code>\" instead of \"<date> <title>\", so titles never show up in file listings, sync logs or the trash. Existing notes keep their names.")
      .addToggle((t) => t.setValue(s.opaqueNames).onChange(async (v) => { s.opaqueNames = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName("Rename notes when dates change")
      .setDesc("Off (recommended for Syncthing): a note keeps the name it was created with, so a change on one device can't leave a duplicate on another. On: the date in the file name follows the event.")
      .addToggle((t) => t.setValue(s.renameOnChange).onChange(async (v) => { s.renameOnChange = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName("Mac notifications for alerts")
      .setDesc("Alerts also appear in Notification Center while Obsidian is running (even in the background). Turn off to only get the popup inside Obsidian. iPhone/iPad can only show the popup while Obsidian is open.")
      .addToggle((t) => t.setValue(s.systemNotifications).onChange(async (v) => { s.systemNotifications = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Hour height (px)").setDesc("Taller hours make week and day views easier to tap and drag.").addText((t) =>
      t.setValue(String(s.hourHeight)).onChange(async (v) => { const n = parseInt(v, 10); if (n >= 24 && n <= 200) { s.hourHeight = n; await this.plugin.saveSettings(); } })
    );
    containerEl.createDiv({ cls: "orc-muted", text: "Clock, week start and hour height apply when the calendar is reopened. Calendar names and colors are edited from the Calendars panel." });
  }
}

function sanitizeSettings(raw: Partial<Settings>): Settings {
  // Build a fresh object with only known keys so nothing planted in a synced data.json survives.
  const s = raw ?? {};
  const colors: Record<string, string> = {};
  if (s.colors && typeof s.colors === "object") {
    for (const [k, v] of Object.entries(s.colors)) if (typeof v === "string" && HEX.test(v)) colors[k] = v;
  }
  return {
    rootFolder: safeRoot(s.rootFolder),
    colors,
    hidden: Array.isArray(s.hidden) ? s.hidden.filter((x): x is string => typeof x === "string") : [],
    weekStart: s.weekStart === 1 ? 1 : 0,
    hour12: s.hour12 !== false,
    hourHeight: typeof s.hourHeight === "number" && s.hourHeight >= 24 && s.hourHeight <= 200 ? s.hourHeight : DEFAULT_SETTINGS.hourHeight,
    defaultView: s.defaultView && VIEWS.includes(s.defaultView) ? s.defaultView : "month",
    opaqueNames: s.opaqueNames === true,
    defaultCalendar: typeof s.defaultCalendar === "string" ? s.defaultCalendar.slice(0, 60) : "",
    renameOnChange: s.renameOnChange === true,
    systemNotifications: s.systemNotifications !== false,
    monthStyle: MONTH_STYLES.find((m) => m.id === s.monthStyle)?.id ?? "list",
    remindersFolder: safeRoot(s.remindersFolder ?? "Reminders"),
    listColors: Object.fromEntries(Object.entries(s.listColors && typeof s.listColors === "object" ? s.listColors : {}).filter(([, v]) => typeof v === "string" && HEX.test(v))),
    hiddenLists: Array.isArray(s.hiddenLists) ? s.hiddenLists.filter((x): x is string => typeof x === "string") : [],
    defaultList: typeof s.defaultList === "string" ? s.defaultList.slice(0, 60) : "",
  };
}
