// Reminders page, laid out like Apple Reminders: smart-list tiles and "My Lists" on the left,
// the selected list on the right. On a narrow pane (iPhone) the lists screen and the list
// screen are shown one at a time, with "‹ Lists" to go back.
import { Calendar, RawEvent, addDays, cmpKey, formatTime, todayKey, keyParts } from "./model";
import { SMART, SmartList, PRIORITY_MARK, dueLabel, inSmartList, isOverdue, shortDate, sortReminders } from "./reminders";

export interface RemindersCtx {
  getLists(): Calendar[];
  getReminders(): RawEvent[];
  toggleReminder(r: RawEvent): void;
  openReminder(r: RawEvent): void;
  newReminder(init: { list?: string; due?: string | null; flagged?: boolean }): void;
  quickAddReminder(title: string, list: string | null, due: string | null, flagged: boolean): Promise<void>;
  newList(): void;
  editList(c: Calendar): void;
  clearCompleted(list: string | null): void;
  hour12: boolean;
}

// sel: "smart:<id>" or "list:<name>"; null on iPhone means the lists screen.
export interface RemindersState { sel: string | null; showDone: Record<string, boolean>; refocus: boolean }

const GLYPH: Record<SmartList, string> = { today: "", scheduled: "▦", all: "☰", flagged: "⚑", completed: "✓" };

export function renderReminders(body: HTMLElement, ctx: RemindersCtx, st: RemindersState, compact: boolean, redraw: () => void) {
  const lists = ctx.getLists();
  const all = ctx.getReminders();
  const today = todayKey();
  if (st.sel?.startsWith("list:") && !lists.some((l) => "list:" + l.name === st.sel)) st.sel = null;
  if (!st.sel && !compact) st.sel = "smart:today";
  const page = body.createDiv({ cls: "orc-rem" });
  page.toggleClass("is-compact", compact);
  const pick = (sel: string) => { st.sel = sel; redraw(); };

  if (!compact || !st.sel) {
    const side = page.createDiv({ cls: "orc-rem-side" });
    const tiles = side.createDiv({ cls: "orc-rtiles" });
    for (const s of SMART) {
      const tile = tiles.createDiv({ cls: "orc-rtile" });
      tile.setAttribute("data-smart", s.id);
      tile.toggleClass("is-active", !compact && st.sel === "smart:" + s.id);
      tile.style.setProperty("--cal", s.color);
      const top = tile.createDiv({ cls: "orc-rtile-top" });
      top.createDiv({ cls: "orc-ricon", text: s.id === "today" ? String(keyParts(today).d) : GLYPH[s.id] });
      if (s.id !== "completed") top.createDiv({ cls: "orc-rtile-count", text: String(all.filter((r) => inSmartList(r, s.id, today)).length) });
      tile.createDiv({ cls: "orc-rtile-label", text: s.label });
      tile.addEventListener("click", () => pick("smart:" + s.id));
    }
    side.createDiv({ cls: "orc-rsection", text: "My Lists" });
    const box = side.createDiv({ cls: "orc-rlists" });
    if (!lists.length) box.createDiv({ cls: "orc-muted orc-rlists-empty", text: "No lists yet. Your first reminder makes a \"Reminders\" list." });
    for (const l of lists) {
      const row = box.createDiv({ cls: "orc-rlistrow" });
      row.setAttribute("data-list", l.name);
      row.toggleClass("is-active", !compact && st.sel === "list:" + l.name);
      row.style.setProperty("--cal", l.color);
      row.createDiv({ cls: "orc-ricon orc-ricon-sm", text: "☰" });
      row.createDiv({ cls: "orc-rlistname", text: l.name });
      row.createDiv({ cls: "orc-rlistcount", text: String(all.filter((r) => !r.completed && r.calendar.name === l.name).length) });
      const info = row.createDiv({ cls: "orc-info", text: "ⓘ", attr: { "aria-label": `Edit ${l.name}` } });
      info.addEventListener("click", (e) => { e.stopPropagation(); ctx.editList(l); });
      row.addEventListener("click", () => pick("list:" + l.name));
    }
    const add = side.createDiv({ cls: "orc-radd-list" });
    add.createSpan({ cls: "orc-radd-plus", text: "+" });
    add.createSpan({ text: "Add List" });
    add.addEventListener("click", () => ctx.newList());
  }
  if (!st.sel) return;

  // ----- the selected list -----
  const sel = st.sel;
  const isList = sel.startsWith("list:");
  const listName = isList ? sel.slice(5) : null;
  const smart = isList ? null : (sel.slice(6) as SmartList);
  const meta = isList ? lists.find((l) => l.name === listName)! : SMART.find((s) => s.id === smart)!;
  const color = isList ? (meta as Calendar).color : (meta as { color: string }).color;
  const label = isList ? (meta as Calendar).name : (meta as { label: string }).label;

  // Membership ignoring done/not done; "open" and "done" parts are split below.
  const member = (r: RawEvent): boolean => {
    if (listName != null) return r.calendar.name === listName;
    switch (smart) {
      case "today": return r.completed ? String(r.completed).startsWith(today) : !!r.date && cmpKey(r.date, today) <= 0;
      case "scheduled": return !!r.date;
      case "flagged": return !!r.flagged;
      default: return true;
    }
  };
  const mine = all.filter(member);
  const open = smart === "completed" ? [] : sortReminders(mine.filter((r) => !r.completed));
  const done = sortReminders(mine.filter((r) => !!r.completed));
  const showDone = smart === "completed" || !!st.showDone[sel];

  const main = page.createDiv({ cls: "orc-rem-main" });
  main.style.setProperty("--cal", color);
  if (compact) {
    const back = main.createDiv({ cls: "orc-rback" });
    back.createSpan({ cls: "orc-chev", text: "‹" });
    back.createSpan({ text: "Lists" });
    back.addEventListener("click", () => { st.sel = null; redraw(); });
  }
  const head = main.createDiv({ cls: "orc-rhead" });
  head.createDiv({ cls: "orc-rtitle", text: label });
  if (smart !== "completed") head.createDiv({ cls: "orc-rtitle-count", text: String(open.length) });
  if (smart !== "completed") {
    const plus = head.createDiv({ cls: "orc-rplus", text: "+", attr: { "aria-label": "New reminder", title: "New reminder" } });
    plus.addEventListener("click", () => ctx.newReminder({ list: listName ?? undefined, due: smart === "today" || smart === "scheduled" ? today : null, flagged: smart === "flagged" }));
  }

  if (done.length && smart !== "completed") {
    const bar = main.createDiv({ cls: "orc-rdonebar" });
    bar.createSpan({ text: `${done.length} Completed` });
    if (isList || smart === "all") {
      bar.createSpan({ text: " • " });
      bar.createSpan({ cls: "orc-rlink", text: "Clear" }).addEventListener("click", () => ctx.clearCompleted(listName));
    }
    bar.createSpan({ cls: "orc-rlink orc-rshow", text: showDone ? "Hide" : "Show" }).addEventListener("click", () => { st.showDone[sel] = !showDone; redraw(); });
  }
  if (smart === "completed" && done.length) {
    const bar = main.createDiv({ cls: "orc-rdonebar" });
    bar.createSpan({ text: `${done.length} Completed • ` });
    bar.createSpan({ cls: "orc-rlink", text: "Clear" }).addEventListener("click", () => ctx.clearCompleted(null));
  }

  const scroller = main.createDiv({ cls: "orc-ritems" });
  const fmt = (m: number) => formatTime(m, ctx.hour12);
  const showListName = !isList && smart !== "all"; // "All" is already grouped by list
  const row = (parent: HTMLElement, r: RawEvent) => {
    const el = parent.createDiv({ cls: "orc-rrow" });
    el.setAttribute("data-path", r.path);
    el.toggleClass("is-done", !!r.completed);
    el.style.setProperty("--cal", r.calendar.color);
    const check = el.createDiv({ cls: "orc-rcheck", attr: { role: "checkbox", "aria-checked": String(!!r.completed), "aria-label": r.completed ? "Mark as not done" : "Mark as done" } });
    check.toggleClass("is-done", !!r.completed);
    check.addEventListener("click", (e) => {
      e.stopPropagation();
      check.toggleClass("is-done", !r.completed); // instant feedback; the note is written right away
      el.addClass("is-toggling");
      ctx.toggleReminder(r);
    });
    const txt = el.createDiv({ cls: "orc-rrow-body" });
    const t = txt.createDiv({ cls: "orc-rrow-title" });
    if (r.priority && r.priority !== "none") t.createSpan({ cls: "orc-rprio", text: PRIORITY_MARK[r.priority] + " " });
    t.createSpan({ text: r.title });
    const bits: [string, string][] = [];
    if (showListName) bits.push([r.calendar.name, ""]);
    const due = dueLabel(r, fmt, today);
    if (due) bits.push([due, isOverdue(r) ? "is-overdue" : ""]);
    if (r.reminderRepeat && r.reminderRepeat !== "none") bits.push(["↻", ""]);
    if (r.completed && !due) bits.push(["Completed " + shortDate(String(r.completed).slice(0, 10), today), ""]);
    if (bits.length) {
      const m = txt.createDiv({ cls: "orc-rrow-meta" });
      bits.forEach(([s, cls], i) => { if (i) m.createSpan({ text: "  " }); m.createSpan({ cls, text: s }); });
    }
    if (r.url) txt.createDiv({ cls: "orc-rrow-url", text: r.url });
    if (r.flagged) el.createDiv({ cls: "orc-rflag", text: "⚑" });
    el.addEventListener("click", () => ctx.openReminder(r));
  };

  const addRow = (parent: HTMLElement, list: string | null, due: string | null, flagged: boolean) => {
    const el = parent.createDiv({ cls: "orc-rrow orc-radd" });
    el.createDiv({ cls: "orc-rcheck is-placeholder" });
    const input = el.createEl("input", { cls: "orc-radd-input", attr: { type: "text", placeholder: "New Reminder", maxlength: "500", "aria-label": "New reminder" } });
    let busy = false;
    const commit = async (keep: boolean) => {
      const v = input.value.trim();
      if (!v || busy) return;
      busy = true;
      st.refocus = keep;
      input.value = "";
      try { await ctx.quickAddReminder(v, list, due, flagged); } finally { busy = false; }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); void commit(true); }
      else if (e.key === "Escape") { input.value = ""; input.blur(); }
      e.stopPropagation(); // typing never triggers calendar shortcuts
    });
    input.addEventListener("blur", () => void commit(false));
    if (st.refocus) { st.refocus = false; window.setTimeout(() => input.focus(), 0); }
  };

  const quickDue = smart === "today" || smart === "scheduled" ? today : null;
  if (smart === "scheduled") {
    // Grouped by day like Apple: Past Due, Today, Tomorrow, then dates.
    const groups = new Map<string, RawEvent[]>();
    for (const r of open) {
      const k = cmpKey(r.date!, today) < 0 ? "past" : r.date!;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
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
