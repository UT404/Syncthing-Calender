// Calendar UI: year / month / week / day views with Apple-Calendar-style drag and drop.
// Framework-free so it can be tested outside Obsidian and stays small.
// Mouse/pen: press and drag. Touch: press and hold ~0.35 s, then drag (so scrolling still works).
import {
  Calendar,
  EventInstance,
  DAY_SHORT,
  MONTH_NAMES,
  MONTH_SHORT,
  DAY_NAMES,
  addDays,
  addMonths,
  cmpKey,
  daysInMonth,
  dayOfWeek,
  formatTime,
  instancesOnDay,
  keyParts,
  isValidKey,
  layoutOverlaps,
  pad,
  todayKey,
  diffDays,
} from "./model";
import { RemindersCtx, RemindersState, renderReminders } from "./reminders-ui";

// iPhone month layouts, as in Apple Calendar's View menu.
export type MonthStyle = "details" | "list";
export const MONTH_STYLES: { id: MonthStyle; label: string; hint: string }[] = [
  { id: "details", label: "Details", hint: "Event names in each day" },
  { id: "list", label: "List", hint: "Dots + the day's events below" },
];
export type ViewKind = "year" | "month" | "week" | "day" | "reminders";
type CalView = Exclude<ViewKind, "reminders">;

export interface UIState {
  view: ViewKind;
  cursor: string; // the day the view is centered on
}

// Result of a drag: whole-day shift, and for timed events the new start/end minutes.
export interface MoveChange {
  dayDelta: number;
  start?: number | null;
  end?: number | null;
}

export interface UIContext extends RemindersCtx {
  isListHidden(name: string): boolean;
  monthStyle(): MonthStyle;
  setMonthStyle(s: MonthStyle): void;
  setListHidden(name: string, hidden: boolean): void;
  getInstances(from: string, to: string): EventInstance[];
  getCalendars(): Calendar[];
  isHidden(name: string): boolean;
  setHidden(name: string, hidden: boolean): void;
  openEvent(inst: EventInstance): void;
  createEvent(date: string, startMinutes: number | null, endMinutes?: number | null, onCancel?: () => void, allDay?: boolean, endDate?: string): void;
  moveEvent(inst: EventInstance, change: MoveChange): void;
  newCalendarColor(): string; // color of the calendar new events go into (drag-to-create preview)
  conflictCount(): number;
  showConflicts(): void;
  version: string;
  renderEmpty(el: HTMLElement): void;
  newCalendar(): void;
  editCalendar(cal: Calendar): void;
  search(): void;
  importICS(): void;
  exportICS(): void;
  hour12: boolean;
  weekStart: 0 | 1;
  hourHeight: number;
  state: UIState;
  onStateChange(state: UIState): void;
}

interface Gesture {
  move(x: number, y: number): void;
  end(x: number, y: number): void;
  cancel(): void;
}

const HOURS = 24;
const SNAP = 15; // minutes
const MAX_END = 23 * 60 + 59;
const TOUCH_HOLD_MS = 350;
const SVG_NS = "http://www.w3.org/2000/svg";

export class CalendarUI {
  private root: HTMLElement;
  private body!: HTMLElement;
  private titleEl!: HTMLElement;
  private backBtn!: HTMLElement;
  private styleBtn!: HTMLElement;
  private styleMenu: HTMLElement | null = null;
  private segBtns: Record<CalView, HTMLElement> = {} as any;
  private remBtn!: HTMLElement;
  private lastCalView: CalView = "month";
  private rstate: RemindersState = { sel: null, showDone: {}, refocus: false };
  private calPanel!: HTMLElement;
  private calPanelOpen = false;
  private selected: string;
  private nowTimer: number | null = null;
  private pending = false;
  private dragging = false;
  private suppressClickUntil = 0;
  private active: Gesture | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private container: HTMLElement, private ctx: UIContext) {
    this.root = container.createDiv({ cls: "orc" });
    this.root.tabIndex = 0;
    this.selected = ctx.state.cursor;
    this.buildChrome();
    // After a drag, swallow the click the browser synthesizes on release.
    this.root.addEventListener("click", (e) => {
      if (Date.now() < this.suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    this.root.addEventListener("keydown", (e) => this.onKey(e));
    // Year and month layouts depend on the pane's width: redraw when it changes.
    if (typeof ResizeObserver !== "undefined") {
      let lastW = 0, t: number | null = null;
      const ro = new ResizeObserver(() => {
        const w = this.root.clientWidth;
        if (Math.abs(w - lastW) < 8) return;
        lastW = w;
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => { if (this.state.view === "year" || this.state.view === "month" || this.state.view === "reminders") this.render(); }, 120);
      });
      ro.observe(this.root);
      this.cleanup.push(() => ro.disconnect());
    }
    this.root.addEventListener("pointerdown", (e) => {
      if (!(e.target as HTMLElement).closest("input,textarea,select")) this.root.focus({ preventScroll: true });
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

  goTo(date: string, view?: ViewKind) {
    if (!isValidKey(date)) return;
    this.selected = date;
    if (view) this.state.view = view;
    else if (this.state.view === "reminders") this.state.view = this.lastCalView;
    this.setCursor(date);
  }

  // ---------- chrome ----------

  private buildChrome() {
    const header = this.root.createDiv({ cls: "orc-header" });
    const nav = header.createDiv({ cls: "orc-nav" });
    const left = nav.createDiv({ cls: "orc-nav-left" });
    const addCal = left.createDiv({ cls: "orc-icon-btn orc-add-cal", attr: { "aria-label": "New calendar", title: "New calendar" } });
    icon(addCal, "calendar-plus");
    addCal.addEventListener("click", () => this.ctx.newCalendar());
    this.backBtn = left.createDiv({ cls: "orc-back" });
    this.backBtn.addEventListener("click", () => this.goUp());
    // Reminders sit next to the view switcher: one tap between calendar and reminders.
    this.remBtn = left.createDiv({ cls: "orc-icon-btn orc-rem-btn", attr: { "aria-label": "Reminders", title: "Reminders (R)" } });
    icon(this.remBtn, "reminders");
    this.remBtn.addEventListener("click", () => this.setView(this.state.view === "reminders" ? this.lastCalView : "reminders"));

    const seg = nav.createDiv({ cls: "orc-seg" });
    (["year", "month", "week", "day"] as CalView[]).forEach((v) => {
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
    const prev = titleRow.createDiv({ cls: "orc-arrow", text: "‹" });
    prev.addEventListener("click", () => this.step(-1));
    this.titleEl = titleRow.createDiv({ cls: "orc-title" });
    // iPhone month view: Compact / Stacked / Details / List, like Apple's View menu.
    this.styleBtn = titleRow.createDiv({ cls: "orc-style-btn", attr: { "aria-label": "Month layout", title: "Month layout" } });
    this.styleBtn.addEventListener("click", (e) => { e.stopPropagation(); this.toggleStyleMenu(); });
    const next = titleRow.createDiv({ cls: "orc-arrow", text: "›" });
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

  private toggleCalPanel(force?: boolean) {
    this.calPanelOpen = force ?? !this.calPanelOpen;
    this.calPanel.style.display = this.calPanelOpen ? "" : "none";
    if (this.calPanelOpen) this.renderCalPanel();
  }

  private renderCalPanel() {
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
      const info = row.createSpan({ cls: "orc-info", text: "ⓘ", attr: { "aria-label": `Edit ${c.name}` } });
      info.addEventListener("click", (e) => { e.stopPropagation(); this.toggleCalPanel(false); this.ctx.editCalendar(c); });
      row.addEventListener("click", () => {
        this.ctx.setHidden(c.name, !this.ctx.isHidden(c.name));
        check.toggleClass("is-on", !this.ctx.isHidden(c.name));
        this.render();
      });
    }
    const newCal = list.createDiv({ cls: "orc-calrow orc-calrow-action" });
    newCal.createSpan({ cls: "orc-calname orc-link", text: "New calendar…" });
    newCal.addEventListener("click", () => { this.toggleCalPanel(false); this.ctx.newCalendar(); });
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
        const info = row.createSpan({ cls: "orc-info", text: "ⓘ", attr: { "aria-label": `Edit ${l.name}` } });
        info.addEventListener("click", (e) => { e.stopPropagation(); this.toggleCalPanel(false); this.ctx.editList(l); });
        row.addEventListener("click", () => {
          this.ctx.setListHidden(l.name, !this.ctx.isListHidden(l.name));
          check.toggleClass("is-on", !this.ctx.isListHidden(l.name));
          this.render();
        });
      }
    }
    const newList = list.createDiv({ cls: "orc-calrow orc-calrow-action" });
    newList.createSpan({ cls: "orc-calname orc-link", text: "New reminder list…" });
    newList.addEventListener("click", () => { this.toggleCalPanel(false); this.ctx.newList(); });
    list.createDiv({ cls: "orc-calpanel-sub", text: "Import / export" });
    const actions: [string, () => void][] = [
      ["Import .ics…", () => this.ctx.importICS()],
      ["Export .ics…", () => this.ctx.exportICS()],
    ];
    for (const [label, fn] of actions) {
      const row = list.createDiv({ cls: "orc-calrow orc-calrow-action" });
      row.createSpan({ cls: "orc-calname orc-link", text: label });
      row.addEventListener("click", () => { this.toggleCalPanel(false); fn(); });
    }
    list.createDiv({ cls: "orc-version orc-muted", text: `Syncthing Calendar v${this.ctx.version}` });
  }

  // ---------- navigation ----------

  setView(v: ViewKind) {
    if (v !== "reminders") this.lastCalView = v;
    this.state.view = v;
    this.commitState();
    this.render();
  }

  setCursor(key: string) {
    if (!isValidKey(key)) return; // refuse to navigate outside years 1000–9998
    this.state.cursor = key;
    this.commitState();
    this.render();
  }

  private commitState() {
    this.ctx.onStateChange(this.state);
  }

  private goUp() {
    const v = this.state.view;
    if (v === "month") this.setView("year");
    else if (v === "week" || v === "day") this.setView("month");
  }

  private step(n: number) {
    if (this.state.view === "reminders") return;
    const k = this.stepKey(n);
    if (this.state.view === "day") this.selected = k;
    this.setCursor(k);
  }

  // Desktop shortcuts while the calendar has focus (Apple-like, without stealing Obsidian's ⌘ keys).
  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input,textarea,select,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const map: Record<string, () => void> = {
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
      Escape: () => { this.cancelActive(); if (this.calPanelOpen) this.toggleCalPanel(false); },
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  }

  // ---------- paging: swipe / two-finger scroll to the next period ----------
  // Week and day page sideways; month and year page up/down (and sideways). While the fingers move,
  // the next (or previous) period slides in next to the current one; on release it snaps to
  // whichever one is mostly showing, like Apple Calendar.

  private stage!: HTMLElement;
  private peek: HTMLElement | null = null;
  private peekDir = 0;
  private pageAxis: "x" | "y" | null = null;
  private pageOffset = 0;
  private wheelTimer: number | null = null;
  private wheelLockUntil = 0;
  private paging = false;
  private wheelHist: number[] = [];
  private settling = false;
  private wheelDone: (() => void) | null = null;

  private stepKey(n: number): string {
    const c = this.state.cursor;
    const { y, m } = keyParts(c);
    switch (this.state.view) {
      case "year": return `${y + n}-${pad(m)}-01`;
      case "month": return addMonths(`${y}-${pad(m)}-01`, n);
      case "week": return addDays(c, 7 * n);
      default: return addDays(c, n);
    }
  }

  private axesFor(): ("x" | "y")[] {
    const v = this.state.view;
    if (v === "week" || v === "day") return ["x"];
    if (v === "month" || v === "year") return ["y", "x"];
    return [];
  }

  // Can the element under the pointer scroll itself this way? Then the scroll is left to it.
  private nativeScroll(target: EventTarget | null, axis: "x" | "y", delta: number): boolean {
    for (let el = target as HTMLElement | null; el && el !== this.stage; el = el.parentElement) {
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

  private pageSize(): number {
    return this.pageAxis === "y" ? this.stage.clientHeight : this.stage.clientWidth;
  }

  // Draw the neighbouring period into a second layer, reusing the normal renderers.
  private makePeek(dir: number) {
    this.peek?.remove();
    const el = this.stage.createDiv({ cls: "orc-body orc-peek" });
    const saved = { body: this.body, cursor: this.state.cursor, selected: this.selected, timer: this.nowTimer };
    this.body = el;
    this.state.cursor = this.stepKey(dir);
    try { this.renderView(); } finally {
      if (this.nowTimer !== saved.timer && this.nowTimer) window.clearInterval(this.nowTimer);
      this.body = saved.body; this.state.cursor = saved.cursor; this.selected = saved.selected; this.nowTimer = saved.timer;
    }
    // Same time-of-day position as the current week/day, so the two line up.
    const cur = this.body.querySelector<HTMLElement>(".orc-timegrid"), nxt = el.querySelector<HTMLElement>(".orc-timegrid");
    if (cur && nxt) { const top = cur.scrollTop; nxt.scrollTop = top; window.requestAnimationFrame(() => { nxt.scrollTop = top; }); }
    this.peek = el;
    this.peekDir = dir;
  }

  private paintPage(animate: boolean) {
    const size = this.pageSize();
    const t = (off: number) => (this.pageAxis === "y" ? `translateY(${off}px)` : `translateX(${off}px)`);
    for (const el of [this.body, this.peek]) if (el) el.style.transition = animate ? "transform .22s ease-out" : "none";
    this.body.style.transform = t(this.pageOffset);
    if (this.peek) this.peek.style.transform = t(this.pageOffset + this.peekDir * size);
  }

  private beginPage(axis: "x" | "y") {
    this.paging = true;
    this.pageAxis = axis;
    this.pageOffset = 0;
    this.root.addClass("is-paging");
  }

  private movePage(offset: number) {
    const size = this.pageSize();
    this.pageOffset = Math.max(-size, Math.min(size, offset));
    const dir = this.pageOffset < 0 ? 1 : this.pageOffset > 0 ? -1 : 0;
    if (dir && dir !== this.peekDir) this.makePeek(dir);
    this.paintPage(false);
  }

  // On release: snap to whichever period covers more of the screen.
  private endPage() {
    if (!this.paging) return;
    const size = this.pageSize();
    const dir = this.peekDir;
    // "More than half": of the screen sideways; up/down, of the month grid (on iPhone the grid is only
    // the top part of the screen, so a finger starting on it can still reach halfway).
    const grid = this.pageAxis === "y" ? this.body.querySelector<HTMLElement>(".orc-month")?.clientHeight ?? size : size;
    const go = dir !== 0 && !!this.peek && Math.abs(this.pageOffset) > Math.min(size, grid) / 2;
    this.pageOffset = go ? -dir * size : 0;
    this.paintPage(true);
    this.settling = true;
    window.setTimeout(() => {
      this.paging = false;
      this.settling = false;
      this.root.removeClass("is-paging");
      this.body.style.transform = ""; this.body.style.transition = "";
      this.peek?.remove(); this.peek = null; this.peekDir = 0; this.pageAxis = null;
      if (go) this.step(dir); else if (this.pending) this.render();
    }, 230);
  }

  private attachPaging(stage: HTMLElement) {
    // Trackpad (two fingers) and mouse wheel.
    stage.addEventListener("wheel", (e: WheelEvent) => {
      if (this.dragging || e.ctrlKey || this.calPanelOpen) return;
      if (this.settling) { if (this.pageAxis) e.preventDefault(); return; }
      const axes = this.axesFor();
      if (!axes.length) return;
      if (Date.now() < this.wheelLockUntil) {
        // Momentum after a page turn: swallow it until the fingers have really stopped.
        if (this.pageAxis == null && !this.nativeScroll(e.target, Math.abs(e.deltaX) > Math.abs(e.deltaY) ? "x" : "y", Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)) {
          this.wheelLockUntil = Date.now() + 120; e.preventDefault();
        }
        return;
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.stage.clientHeight : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (!this.paging) {
        const axis: "x" | "y" = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (!axes.includes(axis) || this.nativeScroll(e.target, axis, axis === "x" ? dx : dy)) return;
        this.beginPage(axis);
      }
      e.preventDefault();
      this.movePage(this.pageOffset - (this.pageAxis === "y" ? dy : dx));
      const done = () => { if (this.wheelTimer) window.clearTimeout(this.wheelTimer); this.wheelTimer = null; this.wheelHist = []; this.wheelLockUntil = Date.now() + 250; this.endPage(); };
      this.wheelDone = done;
      // A trackpad never says when fingers lift. Resting fingers send nothing, so nothing snaps.
      // Lifting while moving sends "momentum" (steadily shrinking steps): that is the release.
      const step = Math.abs(this.pageAxis === "y" ? dy : dx);
      const h = this.wheelHist; h.push(step); if (h.length > 8) h.shift();
      const momentum = h.length >= 6 && h.slice(-6).every((v, i, a) => i === 0 || (v < a[i - 1] && v <= a[i - 1] * 0.97));
      if (momentum) { done(); return; }
      if (this.wheelTimer) window.clearTimeout(this.wheelTimer);
      // Lifted without momentum: the next pointer move (or 4 s of nothing) counts as letting go.
      this.wheelTimer = window.setTimeout(done, 4000);
    }, { passive: false });

    // Moving the pointer means the two fingers came off the trackpad.
    stage.ownerDocument.addEventListener("mousemove", (e: MouseEvent) => {
      if (this.wheelTimer != null && (e.movementX || e.movementY) && this.wheelDone) this.wheelDone();
    });

    // Touch: drag with one finger (without holding first; holding starts an event drag instead).
    let x0 = 0, y0 = 0, t0 = 0, decided = false, target: EventTarget | null = null;
    stage.addEventListener("touchstart", (e: TouchEvent) => {
      if (e.touches.length !== 1 || this.paging) { decided = true; return; }
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); decided = false; target = e.target;
    }, { passive: true });
    stage.addEventListener("touchmove", (e: TouchEvent) => {
      if (this.dragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (!decided) {
        if (Math.hypot(dx, dy) < 12 || Date.now() - t0 > 900) return;
        decided = true;
        const axis: "x" | "y" = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (!this.axesFor().includes(axis) || this.nativeScroll(target, axis, axis === "x" ? -dx : -dy)) return;
        this.beginPage(axis);
      }
      if (!this.paging) return;
      e.preventDefault();
      const d = this.pageAxis === "x" ? dx : dy;
      this.movePage(d);
    }, { passive: false });
    const end = () => { if (this.paging && this.wheelTimer == null) this.endPage(); }; // only when the finger lifts
    stage.addEventListener("touchend", end);
    stage.addEventListener("touchcancel", end);
  }

  // ---------- gestures ----------

  // One drag system for mouse, pen and touch. `start` decides what the press means and returns a
  // gesture, or null to ignore it (e.g. pressing on something else).
  private attachGesture(el: HTMLElement, start: (x: number, y: number, target: HTMLElement, touch: boolean) => Gesture | null, opts: { holdCreates?: boolean } = {}) {
    // Mouse and pen: start after a 4 px move, so plain clicks still open things.
    el.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0 || this.active) return;
      const win = el.ownerDocument.defaultView ?? window; // works in Obsidian pop-out windows too
      const target = e.target as HTMLElement;
      const x0 = e.clientX, y0 = e.clientY;
      let g: Gesture | null = null;
      const move = (ev: PointerEvent) => {
        if (ev.buttons === 0) { up(ev); return; } // released outside the window
        if (g && this.active !== g) { done(); return; }
        if (!g) {
          if (!el.isConnected) { done(); return; }
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
          g = start(x0, y0, target, false);
          if (!g) { done(); return; }
          this.begin(g);
        }
        ev.preventDefault();
        g.move(ev.clientX, ev.clientY);
      };
      const up = (ev: PointerEvent) => {
        if (g && this.active === g) { g.end(ev.clientX, ev.clientY); this.finish(); } // not if Escape cancelled it
        done();
      };
      const done = () => {
        win.removeEventListener("pointermove", move);
        win.removeEventListener("pointerup", up);
        win.removeEventListener("pointercancel", cancel);
      };
      const cancel = () => { if (g && this.active === g) this.cancelActive(); done(); };
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", up);
      win.addEventListener("pointercancel", cancel);
    });

    // Touch: press and hold, then drag. Moving first scrolls as usual.
    let timer: number | null = null;
    let g: Gesture | null = null;
    let sx = 0, sy = 0;
    const clearTimer = () => { if (timer) { window.clearTimeout(timer); timer = null; } };
    el.addEventListener("touchstart", (e: TouchEvent) => {
      if (e.touches.length !== 1 || this.active) return;
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      const target = e.target as HTMLElement;
      clearTimer();
      timer = window.setTimeout(() => {
        timer = null;
        if (!el.isConnected || this.active) return; // view was redrawn during the hold
        g = start(sx, sy, target, true);
        if (g) { this.begin(g); g.move(sx, sy); }
      }, TOUCH_HOLD_MS);
    }, { passive: true });
    el.addEventListener("touchmove", (e: TouchEvent) => {
      const t = e.touches[0];
      if (g && this.active !== g) g = null; // cancelled meanwhile
      if (g) { e.preventDefault(); g.move(t.clientX, t.clientY); return; }
      if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > 10) clearTimer();
    }, { passive: false });
    el.addEventListener("touchend", (e: TouchEvent) => {
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
    el.addEventListener("touchcancel", () => { clearTimer(); if (g && this.active === g) this.cancelActive(); g = null; });
    void opts;
  }

  private begin(g: Gesture) {
    this.active = g;
    this.dragging = true;
    this.root.addClass("is-dragging");
  }

  private cancelActive() {
    const g = this.active;
    if (!g) return;
    g.cancel();
    this.finish();
  }

  private finish() {
    this.active = null;
    this.dragging = false;
    this.suppressClickUntil = Date.now() + 400;
    this.root.removeClass("is-dragging");
    if (this.pending) window.setTimeout(() => this.renderIfPending(), 0);
  }

  // ---------- render ----------

  private isVisible(): boolean {
    return this.root.isConnected && this.root.offsetParent !== null;
  }

  renderIfPending() {
    if (this.pending && this.isVisible()) this.render();
  }

  render() {
    if (!this.isVisible()) { this.pending = true; return; }
    if (this.dragging || this.paging) { this.pending = true; return; } // never redraw under the finger; catch up after
    this.pending = false;
    const v = this.state.view;
    for (const k of Object.keys(this.segBtns) as CalView[]) this.segBtns[k].toggleClass("is-active", k === v);
    this.remBtn.toggleClass("is-active", v === "reminders");
    if (v !== "reminders") this.lastCalView = v;
    this.root.setAttribute("data-view", v);
    this.root.toggleClass("is-narrow", this.isCompact());
    this.closeStyleMenu();
    const showStyle = v === "month" && this.isCompact();
    this.styleBtn.style.display = showStyle ? "" : "none";
    if (showStyle) this.styleBtn.setText(MONTH_STYLES.find((s) => s.id === this.ctx.monthStyle())!.label + " ▾");
    this.renderBack();
    this.renderTitle();
    this.body.empty();
    if (this.nowTimer) { window.clearInterval(this.nowTimer); this.nowTimer = null; }
    if (v === "reminders") {
      renderReminders(this.body, this.ctx, this.rstate, this.isCompact(), () => this.render());
      if (this.calPanelOpen) this.renderCalPanel();
      return;
    }
    this.renderView();
    if (this.calPanelOpen) this.renderCalPanel();
  }

  // The calendar part of render(): also used to draw the neighbouring period while paging.
  private renderView() {
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

  private toggleStyleMenu() {
    if (this.styleMenu) { this.closeStyleMenu(); return; }
    const menu = this.root.createDiv({ cls: "orc-style-menu" });
    const r = this.styleBtn.getBoundingClientRect(), R = this.root.getBoundingClientRect();
    menu.style.top = `${r.bottom - R.top + 4}px`;
    menu.style.right = `${Math.max(8, R.right - r.right)}px`;
    for (const s of MONTH_STYLES) {
      const row = menu.createDiv({ cls: "orc-style-item" });
      row.setAttribute("data-style", s.id);
      row.createSpan({ cls: "orc-style-tick", text: s.id === this.ctx.monthStyle() ? "✓" : "" });
      const t = row.createDiv();
      t.createDiv({ text: s.label });
      t.createDiv({ cls: "orc-muted", text: s.hint });
      row.addEventListener("click", (e) => { e.stopPropagation(); this.ctx.setMonthStyle(s.id); this.closeStyleMenu(); this.render(); });
    }
    this.styleMenu = menu;
    const off = () => this.closeStyleMenu();
    window.setTimeout(() => this.root.addEventListener("click", off, { once: true }), 0);
  }

  private closeStyleMenu() {
    this.styleMenu?.remove();
    this.styleMenu = null;
  }

  private renderBack() {
    const { y, m } = keyParts(this.state.cursor);
    const v = this.state.view;
    this.backBtn.empty();
    if (v === "year" || v === "reminders") { this.backBtn.style.visibility = "hidden"; return; }
    this.backBtn.style.visibility = "";
    this.backBtn.createSpan({ cls: "orc-chev", text: "‹" });
    this.backBtn.createSpan({ text: v === "month" ? String(y) : MONTH_SHORT[m - 1] });
  }

  private renderTitle() {
    const { y, m } = keyParts(this.state.cursor);
    this.titleEl.empty();
    const v = this.state.view;
    if (v === "year") {
      this.titleEl.createSpan({ cls: "orc-title-accent", text: String(y) });
    } else if (v === "week") {
      const ws = this.weekStartOf(this.state.cursor);
      const we = addDays(ws, 6);
      const a = keyParts(ws), b = keyParts(we);
      const txt = a.m === b.m ? `${MONTH_SHORT[a.m - 1]} ${a.d} – ${b.d}` : `${MONTH_SHORT[a.m - 1]} ${a.d} – ${MONTH_SHORT[b.m - 1]} ${b.d}`;
      this.titleEl.createSpan({ cls: "orc-title-accent", text: txt });
      this.titleEl.createSpan({ text: " " + b.y });
    } else {
      this.titleEl.createSpan({ cls: "orc-title-accent", text: MONTH_NAMES[m - 1] });
      this.titleEl.createSpan({ text: " " + y });
    }
  }

  private weekStartOf(key: string): string {
    const offset = (dayOfWeek(key) - this.ctx.weekStart + 7) % 7;
    return addDays(key, -offset);
  }

  private weekdayOrder(): number[] {
    return [0, 1, 2, 3, 4, 5, 6].map((i) => (i + this.ctx.weekStart) % 7);
  }

  private isCompact(): boolean {
    return this.root.clientWidth > 0 && this.root.clientWidth < 520;
  }

  // ---------- year ----------

  private renderYear() {
    const { y } = keyParts(this.state.cursor);
    const wrap = this.body.createDiv({ cls: "orc-year" });
    // Fit 4 months across on wide panes (3 on narrow ones), with square day cells and the same gap
    // between months horizontally and vertically.
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

  private renderMonth() {
    const { y, m } = keyParts(this.state.cursor);
    const today = todayKey();
    const compact = this.isCompact();
    const order = this.weekdayOrder();

    const dow = this.body.createDiv({ cls: "orc-dow" });
    for (const d of order) dow.createDiv({ cls: "orc-dow-cell", text: compact ? DAY_SHORT[d][0] : DAY_SHORT[d] });

    const first = `${y}-${pad(m)}-01`;
    const lead = (dayOfWeek(first) - this.ctx.weekStart + 7) % 7;
    const gridStart = addDays(first, -lead);
    const rows = Math.ceil((lead + daysInMonth(y, m - 1)) / 7);
    const gridEnd = addDays(gridStart, rows * 7 - 1);
    const instances = this.ctx.getInstances(gridStart, gridEnd);

    const style: MonthStyle | null = compact ? this.ctx.monthStyle() : null;
    const scroll = style === "details" ? this.body.createDiv({ cls: "orc-month-scroll" }) : this.body;
    const grid = scroll.createDiv({ cls: "orc-month" });
    grid.style.gridTemplateRows = style === "details" ? `repeat(${rows}, minmax(96px, auto))` : `repeat(${rows}, minmax(0, 1fr))`;
    grid.toggleClass("is-compact", compact);
    if (style) grid.addClass("is-" + style);
    if (!this.selected.startsWith(`${y}-${pad(m)}`)) this.selected = today.startsWith(`${y}-${pad(m)}`) ? today : first;
    const listWrap = style === "list" ? this.body.createDiv({ cls: "orc-daylist" }) : null;

    // Multi-day events: one bar across the days of each week row, like Apple Calendar.
    const useBars = !compact || style === "details";
    const laneH = style === "details" ? 14 : 17;
    grid.style.setProperty("--lh", `${laneH}px`);
    const rowLanes: number[] = [];
    if (useBars) {
      const spans = instances.filter((ev) => ev.multiDay);
      for (let r = 0; r < rows; r++) {
        const rs = addDays(gridStart, r * 7), re = addDays(rs, 6);
        const segs = spans.filter((ev) => cmpKey(ev.date, re) <= 0 && cmpKey(ev.endDate, rs) >= 0)
          .sort((a, b) => cmpKey(a.date, b.date) || diffDays(b.date, b.endDate) - diffDays(a.date, a.endDate));
        const laneEnds: string[] = [];
        for (const ev of segs) {
          const s = cmpKey(ev.date, rs) < 0 ? rs : ev.date;
          const e = cmpKey(ev.endDate, re) > 0 ? re : ev.endDate;
          let lane = laneEnds.findIndex((end) => cmpKey(end, s) < 0);
          if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
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
      // Bars start just under the day numbers.
      window.requestAnimationFrame(() => {
        const dn = grid.querySelector<HTMLElement>(".orc-cell .orc-daynum");
        const cell0 = dn?.parentElement;
        if (dn && cell0) grid.style.setProperty("--dn", `${Math.round(dn.getBoundingClientRect().bottom - cell0.getBoundingClientRect().top) + 1}px`);
      });
    }

    for (let i = 0; i < rows * 7; i++) {
      const key = addDays(gridStart, i);
      const p = keyParts(key);
      const cell = grid.createDiv({ cls: "orc-cell" });
      // Explicit placement so the bars above can overlap the cells.
      cell.style.gridRow = String(Math.floor(i / 7) + 1);
      cell.style.gridColumn = String((i % 7) + 1);
      cell.setAttribute("data-key", key);
      cell.toggleClass("is-other", p.m !== m);
      cell.toggleClass("is-today", key === today);
      cell.toggleClass("is-selected", key === this.selected);
      cell.toggleClass("is-weekend", dayOfWeek(key) === 0 || dayOfWeek(key) === 6);
      cell.createDiv({ cls: "orc-daynum" }).createSpan({ text: p.d === 1 && !compact ? `${MONTH_SHORT[p.m - 1]} ${p.d}` : String(p.d) });

      const allOnDay = instancesOnDay(instances, key);
      const dayEvents = useBars ? allOnDay.filter((ev) => !ev.multiDay) : allOnDay;
      const lanes = useBars ? rowLanes[Math.floor(i / 7)] ?? 0 : 0;
      if (lanes) cell.createDiv({ cls: "orc-mbar-space" }).style.height = `${lanes * laneH}px`;
      if (style === "details") {
        // Apple "Details": every event's name inside the day, the month scrolls.
        const list = cell.createDiv({ cls: "orc-cell-events" });
        dayEvents.slice(0, 12).forEach((ev) => this.renderChip(list, ev, key).addClass("is-detail"));
        if (dayEvents.length > 12) list.createDiv({ cls: "orc-more", text: `+${dayEvents.length - 12}` });
      } else if (compact) {
        const dots = cell.createDiv({ cls: "orc-dots" });
        const seen = new Set<string>();
        for (const ev of dayEvents) {
          if (seen.has(ev.calendar.name) || seen.size >= 4) continue;
          seen.add(ev.calendar.name);
          dots.createDiv({ cls: "orc-dot" }).style.background = ev.calendar.color;
        }
      } else {
        const list = cell.createDiv({ cls: "orc-cell-events" });
        const MAX_CHIPS = 12; // more than ever fits in a cell; the rest is counted as "+N more"
        dayEvents.slice(0, MAX_CHIPS).forEach((ev) => this.renderChip(list, ev, key));
        const more = list.createDiv({ cls: "orc-more" });
        more.setAttribute("data-extra", String(Math.max(0, dayEvents.length - MAX_CHIPS)));
        more.style.display = "none";
      }

      cell.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".orc-chip")) return;
        if (compact && (this.selected === key || style !== "list")) { this.goTo(key, "day"); return; }
        this.selected = key;
        grid.querySelectorAll(".orc-cell.is-selected").forEach((c) => c.classList.remove("is-selected"));
        cell.addClass("is-selected");
        if (listWrap) this.renderDayList(listWrap, instances);
      });
      cell.addEventListener("dblclick", (e) => { if (!(e.target as HTMLElement).closest(".orc-chip")) this.ctx.createEvent(key, null); });
    }

    // Drag chips to another day (date changes, time stays). Long-press on an empty day creates.
    this.attachGesture(grid, (x, y, target, touch) => {
      const chip = target.closest<HTMLElement>(".orc-chip");
      if (chip) return this.chipDrag(chip, grid, x, y);
      if (touch) {
        const cell = target.closest<HTMLElement>(".orc-cell");
        if (cell) this.ctx.createEvent(cell.getAttribute("data-key")!, null);
        return { move() {}, end() {}, cancel() {} };
      }
      return null;
    });

    // iPhone month view shows dots, so events are dragged from the day list under the grid:
    // hold a row, drag it onto a day in the grid (date changes, time stays), same as the Mac.
    if (listWrap) this.attachGesture(listWrap, (x, y, target) => {
      const row = target.closest<HTMLElement>(".orc-listrow");
      return row ? this.chipDrag(row, grid, x, y) : null;
    });

    if (listWrap) this.renderDayList(listWrap, instances);
    else window.requestAnimationFrame(() => this.fitChips(grid));
  }

  private chipDrag(chip: HTMLElement, grid: HTMLElement, x0: number, y0: number): Gesture | null {
    const inst = (chip as unknown as { __inst?: EventInstance }).__inst;
    let fromKey = chip.getAttribute("data-day");
    if (!inst || !fromKey) return null;
    const rect = chip.getBoundingClientRect();
    const span = parseInt(chip.getAttribute("data-span") ?? "1", 10) || 1;
    if (span > 1) fromKey = addDays(fromKey, Math.max(0, Math.min(span - 1, Math.floor(((x0 - rect.left) / rect.width) * span)))); // the day grabbed
    const fromList = chip.hasClass("orc-listrow");
    const ghost = chip.cloneNode(true) as HTMLElement;
    ghost.addClass("orc-drag-ghost");
    ghost.style.width = `${Math.min(rect.width, fromList ? 200 : 240)}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    chip.ownerDocument.body.appendChild(ghost);
    chip.addClass("is-lifted");
    let target: HTMLElement | null = null;
    const pick = (x: number, y: number) => {
      const el = chip.ownerDocument.elementFromPoint(x, y) as HTMLElement | null;
      const cell = el?.closest<HTMLElement>(".orc-cell") ?? null;
      if (cell !== target) {
        target?.removeClass("is-drop-target");
        target = cell && grid.contains(cell) ? cell : null;
        target?.addClass("is-drop-target");
      }
    };
    const clear = () => { ghost.remove(); chip.removeClass("is-lifted"); target?.removeClass("is-drop-target"); };
    return {
      move: (x, y) => {
        // Rows from the iPhone day list float above the finger so the target day stays visible.
        const lift = fromList ? rect.height + 12 : 0;
        ghost.style.transform = `translate(${x - x0}px, ${y - y0 - lift}px)`;
        pick(x, y);
      },
      end: (x, y) => {
        pick(x, y);
        const to = target?.getAttribute("data-key");
        clear();
        if (to && to !== fromKey) this.ctx.moveEvent(inst, { dayDelta: diffDays(fromKey, to) });
      },
      cancel: clear,
    };
  }

  // Hide chips that do not fit in a month cell and show "+N more".
  private fitChips(grid: HTMLElement) {
    grid.querySelectorAll<HTMLElement>(".orc-cell").forEach((cell) => {
      const list = cell.querySelector<HTMLElement>(".orc-cell-events");
      const more = cell.querySelector<HTMLElement>(".orc-more");
      if (!list || !more) return;
      const chips = Array.from(list.querySelectorAll<HTMLElement>(".orc-chip"));
      chips.forEach((c) => (c.style.display = ""));
      more.style.display = "none";
      const avail = list.clientHeight;
      if (avail <= 0) return;
      const extra = parseInt(more.getAttribute("data-extra") ?? "0", 10) || 0;
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
        more.onclick = () => this.goTo(cell.getAttribute("data-key")!, "day");
      }
    });
  }

  private renderDayList(wrap: HTMLElement, instances: EventInstance[]) {
    wrap.empty();
    const key = this.selected;
    const p = keyParts(key);
    wrap.createDiv({ cls: "orc-daylist-head" }).createSpan({ cls: key === todayKey() ? "orc-title-accent" : "", text: `${DAY_NAMES[dayOfWeek(key)]}, ${MONTH_NAMES[p.m - 1]} ${p.d}` });
    const events = instancesOnDay(instances, key);
    if (!events.length) { wrap.createDiv({ cls: "orc-empty", text: "No events" }); return; }
    for (const ev of events) {
      const row = wrap.createDiv({ cls: "orc-listrow" });
      (row as unknown as { __inst?: EventInstance }).__inst = ev;
      row.setAttribute("data-day", key);
      const time = row.createDiv({ cls: "orc-listtime" });
      const isRem = ev.raw.kind === "reminder";
      if (ev.allDay) time.setText(isRem ? "" : "all-day");
      else {
        time.createDiv({ text: formatTime(ev.start, this.ctx.hour12) });
        if (!isRem) time.createDiv({ cls: "orc-muted", text: formatTime(ev.end, this.ctx.hour12) });
      }
      if (isRem) { row.addClass("is-reminder"); row.style.setProperty("--cal", ev.calendar.color); this.reminderCheck(row, ev).addClass("orc-listcheck"); }
      else row.createDiv({ cls: "orc-listbar" }).style.background = ev.calendar.color;
      const txt = row.createDiv({ cls: "orc-listtext" });
      txt.createDiv({ cls: "orc-listtitle", text: ev.title });
      txt.createDiv({ cls: "orc-muted", text: isRem ? `${ev.calendar.name} · Reminder` : ev.raw.location ? `${ev.calendar.name} · ${ev.raw.location}` : ev.calendar.name });
      row.addEventListener("click", () => this.ctx.openEvent(ev));
    }
  }

  private renderChip(parent: HTMLElement, ev: EventInstance, dayKey: string) {
    const chip = parent.createDiv({ cls: "orc-chip" });
    (chip as unknown as { __inst?: EventInstance }).__inst = ev;
    chip.setAttribute("data-day", dayKey);
    chip.style.setProperty("--cal", ev.calendar.color);
    chip.toggleClass("is-allday", ev.allDay);
    chip.toggleClass("is-cont-left", ev.multiDay && cmpKey(ev.date, dayKey) < 0);
    chip.toggleClass("is-cont-right", ev.multiDay && cmpKey(ev.endDate, dayKey) > 0);
    if (ev.raw.kind === "reminder") { chip.addClass("is-reminder"); this.reminderCheck(chip, ev); }
    if (!ev.allDay) chip.createSpan({ cls: "orc-chip-time", text: formatTime(ev.start, this.ctx.hour12).replace(" ", "").toLowerCase() });
    chip.createSpan({ cls: "orc-chip-title", text: ev.title });
    chip.addEventListener("click", (e) => { e.stopPropagation(); this.ctx.openEvent(ev); });
    return chip;
  }

  // The round check box on a reminder. Tapping it marks the reminder done (or not done) without
  // opening it, like Apple Calendar.
  private reminderCheck(parent: HTMLElement, ev: EventInstance): HTMLElement {
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
  private newItem() {
    if (this.state.view === "reminders") {
      const sel = this.rstate.sel ?? "";
      this.ctx.newReminder({ list: sel.startsWith("list:") ? sel.slice(5) : undefined, due: sel === "smart:today" || sel === "smart:scheduled" ? todayKey() : null, flagged: sel === "smart:flagged" });
    } else this.ctx.createEvent(this.selected, null);
  }

  // ---------- week ----------

  private renderWeek() {
    const ws = this.weekStartOf(this.state.cursor);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i));
    const instances = this.ctx.getInstances(days[0], days[6]);
    const compact = this.isCompact();
    const today = todayKey();

    const head = this.body.createDiv({ cls: "orc-week-head" });
    head.createDiv({ cls: "orc-gutter" });
    for (const key of days) {
      const h = head.createDiv({ cls: "orc-week-day" });
      h.toggleClass("is-today", key === today);
      h.toggleClass("is-weekend", dayOfWeek(key) === 0 || dayOfWeek(key) === 6);
      h.createDiv({ cls: "orc-week-dow", text: compact ? DAY_SHORT[dayOfWeek(key)][0] : DAY_SHORT[dayOfWeek(key)] });
      h.createDiv({ cls: "orc-week-num", text: String(keyParts(key).d) });
      h.addEventListener("click", () => this.goTo(key, "day"));
    }
    this.renderAllDayRow(days, instances);
    this.renderTimeGrid(days, instances);
  }

  private renderAllDayRow(days: string[], instances: EventInstance[]) {
    const allDay = instances.filter((i) => i.allDay);
    const row = this.body.createDiv({ cls: "orc-allday" });
    row.createDiv({ cls: "orc-gutter orc-gutter-label", text: "all-day" });
    const lanes = row.createDiv({ cls: "orc-allday-lanes" });
    lanes.style.gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;
    if (!allDay.length) row.addClass("is-empty");
    const laneEnds: string[] = [];
    const first = days[0], last = days[days.length - 1];
    const sorted = [...allDay].sort((a, b) => cmpKey(a.date, b.date) || diffDays(b.date, b.endDate) - diffDays(a.date, a.endDate));
    for (const ev of sorted) {
      const s = cmpKey(ev.date, first) < 0 ? first : ev.date;
      const e = cmpKey(ev.endDate, last) > 0 ? last : ev.endDate;
      let lane = laneEnds.findIndex((end) => cmpKey(end, s) < 0);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
      const bar = lanes.createDiv({ cls: "orc-bar" });
      (bar as unknown as { __inst?: EventInstance }).__inst = ev;
      bar.style.setProperty("--cal", ev.calendar.color);
      bar.style.gridColumn = `${diffDays(first, s) + 1} / ${diffDays(first, e) + 2}`;
      bar.style.gridRow = String(lane + 1);
      bar.toggleClass("is-cont-left", cmpKey(ev.date, first) < 0);
      bar.toggleClass("is-cont-right", cmpKey(ev.endDate, last) > 0);
      if (ev.raw.kind === "reminder") { bar.addClass("is-reminder"); this.reminderCheck(bar, ev); }
      bar.createSpan({ text: ev.title });
      bar.addEventListener("click", () => this.ctx.openEvent(ev));
    }
    // Drag all-day bars sideways to change their day(s).
    if (days.length > 1) this.attachGesture(lanes, (x, _y, target) => {
      const bar = target.closest<HTMLElement>(".orc-bar");
      const inst = bar && (bar as unknown as { __inst?: EventInstance }).__inst;
      if (!bar || !inst) return null;
      const colOf = (px: number) => {
        const r = lanes.getBoundingClientRect();
        return Math.max(0, Math.min(days.length - 1, Math.floor(((px - r.left) / r.width) * days.length)));
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
        cancel: () => { bar.removeClass("is-dragging-bar"); bar.style.gridColumn = orig; },
      };
    });
  }

  private renderTimeGrid(days: string[], instances: EventInstance[]) {
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
    const cols: { key: string; el: HTMLElement }[] = [];
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
        (el as unknown as { __inst?: EventInstance }).__inst = ev;
        el.style.setProperty("--cal", ev.calendar.color);
        el.style.top = `${(ev.start / 60) * H}px`;
        el.style.height = `${Math.max(((ev.end - ev.start) / 60) * H, 14)}px`;
        const w = 100 / p.cols;
        el.style.left = `calc(${p.col * w}% + 1px)`;
        el.style.width = `calc(${w}% - 3px)`;
        if (ev.raw.kind === "reminder") {
          // Reminders have a time but no length: a short bar with a check circle, no resize grip.
          el.addClass("is-reminder");
          el.style.height = `${Math.max(Math.min(H / 2, 24), 18)}px`;
          const line = el.createDiv({ cls: "orc-event-title" });
          this.reminderCheck(line, ev);
          line.createSpan({ text: ev.title });
        } else {
          el.toggleClass("is-short", ev.end - ev.start < 45);
          el.createDiv({ cls: "orc-event-title", text: ev.title });
          if (ev.end - ev.start >= 45 || days.length === 1) {
            el.createDiv({ cls: "orc-event-time", text: `${formatTime(ev.start, this.ctx.hour12)} – ${formatTime(ev.end, this.ctx.hour12)}` });
          }
          el.createDiv({ cls: "orc-resize", attr: { "aria-label": "Drag to change end time" } });
        }
        el.addEventListener("click", (e) => { e.stopPropagation(); this.ctx.openEvent(ev); });
      }
      col.addEventListener("dblclick", (e) => {
        if ((e.target as HTMLElement).closest(".orc-event")) return;
        const start = this.minutesAt(col, e.clientY, true);
        this.ctx.createEvent(key, Math.min(start, 23 * 60), Math.min(start + 60, MAX_END));
      });
      if (key === today) this.renderNowLine(col);
    }

    this.attachGesture(inner, (x, y, target, touch) => {
      const evEl = target.closest<HTMLElement>(".orc-event");
      if (evEl) {
        const inst = (evEl as unknown as { __inst?: EventInstance }).__inst;
        if (!inst) return null;
        return target.closest(".orc-resize") ? this.resizeDrag(evEl, inst, cols, scroller) : this.moveDrag(evEl, inst, cols, scroller, x, y);
      }
      const col = target.closest<HTMLElement>(".orc-daycol");
      if (!col) return null;
      return this.createDrag(col, cols, scroller, y, touch);
    });

    const now = new Date();
    const hasToday = days.includes(today);
    const firstEvent = instances.filter((i) => !i.allDay).map((i) => i.start).sort((a, b) => a - b)[0];
    const scrollTo = hasToday ? Math.max(0, (now.getHours() - 1.5) * H) : firstEvent != null ? Math.max(0, (firstEvent / 60 - 1) * H) : 8 * H;
    window.requestAnimationFrame(() => { scroller.scrollTop = scrollTo; });
  }

  // Minutes from midnight under a screen Y coordinate, snapped to 15 minutes.
  private minutesAt(col: HTMLElement, clientY: number, floor = false): number {
    const r = col.getBoundingClientRect();
    const raw = ((clientY - r.top) / this.ctx.hourHeight) * 60;
    const snapped = floor ? Math.floor(raw / SNAP) * SNAP : Math.round(raw / SNAP) * SNAP;
    return Math.max(0, Math.min(24 * 60, snapped));
  }

  private colAt(cols: { key: string; el: HTMLElement }[], clientX: number) {
    for (const c of cols) {
      const r = c.el.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return c;
    }
    const firstR = cols[0].el.getBoundingClientRect();
    return clientX < firstR.left ? cols[0] : cols[cols.length - 1];
  }

  // Scroll the time grid when dragging near its top or bottom edge.
  private autoScroll(scroller: HTMLElement, clientY: number) {
    const r = scroller.getBoundingClientRect();
    if (clientY < r.top + 36) scroller.scrollTop -= 12;
    else if (clientY > r.bottom - 36) scroller.scrollTop += 12;
  }

  private makeGhost(col: HTMLElement, color: string, title: string): HTMLElement {
    const g = col.createDiv({ cls: "orc-event orc-ghost" });
    g.style.setProperty("--cal", color);
    g.style.left = "1px";
    g.style.width = "calc(100% - 3px)";
    g.createDiv({ cls: "orc-event-title", text: title });
    g.createDiv({ cls: "orc-event-time" });
    return g;
  }

  private paintGhost(g: HTMLElement, start: number, end: number) {
    const H = this.ctx.hourHeight;
    g.style.top = `${(start / 60) * H}px`;
    g.style.height = `${Math.max(((end - start) / 60) * H, 14)}px`;
    const t = g.querySelector<HTMLElement>(".orc-event-time");
    if (t) t.setText(`${formatTime(start, this.ctx.hour12)} – ${formatTime(end, this.ctx.hour12)}`);
  }

  private moveDrag(evEl: HTMLElement, inst: EventInstance, cols: { key: string; el: HTMLElement }[], scroller: HTMLElement, x0: number, y0: number): Gesture {
    const home = cols.find((c) => c.key === inst.date) ?? cols[0];
    const dur = inst.end - inst.start;
    const grabOffset = ((y0 - home.el.getBoundingClientRect().top) / this.ctx.hourHeight) * 60 - inst.start;
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
        if (c !== col) { ghost.remove(); col = c; ghost = this.makeGhost(col.el, inst.calendar.color, inst.title); }
        const r = col.el.getBoundingClientRect();
        const raw = ((y - r.top) / this.ctx.hourHeight) * 60 - grabOffset;
        start = Math.max(0, Math.min(24 * 60 - dur, Math.round(raw / SNAP) * SNAP));
        this.paintGhost(ghost, start, Math.min(start + dur, MAX_END));
      },
      end: () => {
        const dayDelta = diffDays(inst.date, col.key);
        const end = Math.min(start + dur, MAX_END);
        if (dayDelta === 0 && start === inst.start) { ghost.remove(); evEl.removeClass("is-lifted"); return; }
        this.ctx.moveEvent(inst, { dayDelta, start, end }); // redraw replaces the ghost
      },
      cancel: () => { ghost.remove(); evEl.removeClass("is-lifted"); },
    };
  }

  private resizeDrag(evEl: HTMLElement, inst: EventInstance, cols: { key: string; el: HTMLElement }[], scroller: HTMLElement): Gesture {
    const col = cols.find((c) => c.key === inst.date) ?? cols[0];
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
        if (end === inst.end) { ghost.remove(); evEl.removeClass("is-lifted"); return; }
        this.ctx.moveEvent(inst, { dayDelta: 0, start: inst.start, end });
      },
      cancel: () => { ghost.remove(); evEl.removeClass("is-lifted"); },
    };
  }

  // Drag on empty space: a see-through block in the default calendar's color, like Apple Calendar.
  // Drag on empty space: a see-through block in the default calendar's color, like Apple Calendar.
  // Dragging into another day's column makes one event that runs from the first day/time to the last.
  private createDrag(colEl: HTMLElement, cols: { key: string; el: HTMLElement }[], scroller: HTMLElement, y0: number, touch: boolean): Gesture {
    const aKey = colEl.getAttribute("data-key")!;
    const anchor = Math.min(this.minutesAt(colEl, y0, true), 24 * 60 - SNAP);
    const color = this.ctx.newCalendarColor();
    let sKey = aKey, eKey = aKey;
    let start = anchor;
    let end = Math.min(anchor + (touch ? 60 : SNAP), MAX_END);
    let moved = false;
    let ghosts: HTMLElement[] = [];
    const paint = () => {
      ghosts.forEach((g) => g.remove());
      ghosts = [];
      const i0 = cols.findIndex((c) => c.key === sKey), i1 = cols.findIndex((c) => c.key === eKey);
      for (let i = i0; i <= i1; i++) {
        const g = this.makeGhost(cols[i].el, color, i === i0 ? "New Event" : "");
        g.addClass("is-new");
        this.paintGhost(g, i === i0 ? start : 0, i === i1 ? end : 24 * 60);
        if (i !== i1) g.querySelector<HTMLElement>(".orc-event-time")?.setText("");
        ghosts.push(g);
      }
    };
    paint();
    return {
      move: (x, y) => {
        this.autoScroll(scroller, y);
        const col = this.colAt(cols, x);
        const cur = this.minutesAt(col.el, y);
        if (!moved && col.key === aKey && Math.abs(cur - anchor) < SNAP && touch) return; // keep the 1-hour block until the finger moves
        moved = true;
        const before = cmpKey(col.key, aKey) < 0 || (col.key === aKey && cur < anchor);
        if (before) { sKey = col.key; start = Math.min(cur, 24 * 60 - SNAP); eKey = aKey; end = anchor; }
        else { sKey = aKey; start = anchor; eKey = col.key; end = cur; }
        if (sKey === eKey && end - start < SNAP) end = start + SNAP;
        end = Math.min(end, MAX_END);
        paint();
      },
      end: () => {
        if (!touch && !moved) { ghosts.forEach((g) => g.remove()); return; }
        const clear = () => ghosts.forEach((g) => g.remove());
        this.ctx.createEvent(sKey, start, end, clear, false, eKey !== sKey ? eKey : undefined);
      },
      cancel: () => ghosts.forEach((g) => g.remove()),
    };
  }

  private renderNowLine(col: HTMLElement) {
    const line = col.createDiv({ cls: "orc-now" });
    const update = () => {
      if (!this.root.isConnected) return;
      const now = new Date();
      line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * this.ctx.hourHeight}px`;
    };
    update();
    this.nowTimer = window.setInterval(update, 60000);
  }

  // ---------- day ----------

  private renderDay() {
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
}

// Small line icons drawn with DOM calls (no innerHTML, no external files).
function icon(parent: HTMLElement, name: "calendar-plus" | "search" | "plus" | "reminders") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => add("line", { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) });
  if (name === "calendar-plus") {
    add("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" });
    line(3, 10, 21, 10); line(8, 3, 8, 7); line(16, 3, 16, 7);
    line(12, 13, 12, 18); line(9.5, 15.5, 14.5, 15.5);
  } else if (name === "reminders") {
    // A checklist: three round boxes with lines, like the Reminders app icon.
    for (const y of [6, 12, 18]) { add("circle", { cx: "5", cy: String(y), r: "2" }); line(10, y, 21, y); }
  } else if (name === "search") {
    add("circle", { cx: "11", cy: "11", r: "7" });
    line(16.5, 16.5, 21, 21);
  } else {
    line(12, 5, 12, 19); line(5, 12, 19, 12);
  }
  parent.appendChild(svg);
}
