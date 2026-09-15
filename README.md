# Syncthing Calendar (Obsidian plugin) v3.1.9

A year, month, week and day calendar with reminders, in the style of the iPhone and Mac Calendar apps.
Every event and reminder is a plain Markdown note in your vault, so you can sync it with Syncthing (or
anything else) and read it without the plugin. Events use the **Full Calendar** note format, so existing
Full Calendar notes work as-is.

**Private by design:** no network code, no analytics, no third-party code in the bundle. The plugin only
writes inside your calendar and reminders folders and its own settings file.

## Features

### Calendar views
- **Year** view with square day cells; tap a month to open it.
- **Month** view with event names in each day, "+N more" when a day is full, and multi-day events drawn
  as **one bar across the days**, continuing onto the next week.
- **iPhone month layouts** (the "List ▾" button): **List** shows dots with the selected day's events
  underneath; **Details** shows event names inside every day.
- **Week** view with an all-day row and an hourly time grid; overlapping events sit side by side.
- **Day** view with a week strip at the top.
- Red "now" line, today highlighted, 12- or 24-hour clock, week starting Sunday or Monday.
- Swipe or two-finger scroll to the next week or day (sideways) or month or year (up/down); the next one slides
  in beside the current one. Nothing snaps while your fingers are on it (trackpad: resting fingers never snap;
  lifting is detected from the scroll momentum or your next pointer move); on release it snaps to whichever
  one covers more than half.
- Keyboard: `T` today, `←`/`→` previous/next, `D` `W` `M` `Y` switch view, `R` reminders, `N` new, `/` search, `Esc` cancel.

### Calendars
- As many calendars as you like, each a folder with its own color, all shown together.
- **New calendar** button (top left) with name and color; rename, recolor or delete from the ⓘ in the
  Calendars panel. Show or hide any calendar.

### Events
- Title, location, URL, notes (written into the note body), all-day, multi-day (end date).
- Repeat: every day, weekday, week, 2 weeks, month, year, with an optional end date.
- Editing or deleting a repeating event asks **This event only / All events**.
- **Up to 4 alerts** per event (at time of event, 5 min … 2 days before).
- Changing the start time past the end moves the end to 30 minutes after the start.
- Duplicate, open the note, delete (goes to Obsidian's trash setting).

### Drag and drop
- Mac: press and drag. iPhone/iPad/Android: hold about ⅓ second, then drag.
- Move events in week/day view (time and day), drag the bottom edge to change the end time.
- Drag on empty time to create an event, with a see-through preview in the calendar's color. Drag into
  other days to create one event that spans them (for example Mon 11:15 AM to Thu 7 PM).
- Month view: drag an event to another day; the date changes, the time stays. On iPhone, drag from
  the day list onto a day.
- All-day bars drag sideways. 15-minute snapping. `Esc` cancels.

### Reminders (Apple Reminders style)
- Checklist button next to Year/Month/Week/Day opens the Reminders page.
- Smart lists: **Today**, **Scheduled** (grouped Past Due / Today / Tomorrow / dates), **All** (grouped by
  list), **Flagged**, **Completed**, plus **My Lists** with colors and counts, and **Add List**.
- Each reminder: title, notes, date, optional time (no end time), repeat, flag, priority (! !! !!!), list, URL.
- Tap the circle to complete. Repeating reminders keep a completed copy and move on to the next date.
- Repeating reminders show on every date they repeat on in the calendar.
- Type in the "New Reminder" row and press Enter to add quickly. Show/Hide and Clear completed.
- Dated reminders appear on the calendar as a colored bar with a circle you can tap to complete, and can be dragged.
- The new-item window has an **Event / Reminder** switch at the top.
- On iPhone the lists and the selected list are separate screens with "‹ Lists" to go back.

### Search, import, export
- Search all events (`/`), jump to the day.
- **Export .ics** (one calendar or all) to a file in your vault, for Apple Calendar, Google Calendar, Outlook.
- **Import .ics** into a calendar, skipping duplicates.

### Sync safety (Syncthing)
- Every change is written to the note the moment you drop, save or delete.
- Notes keep the file name they were created with (date + title), so a change never looks like
  "delete + new file" to Syncthing. Optional setting to rename notes when dates change.
- Changes arriving from other devices show up by themselves.
- Syncthing conflict copies are never shown as duplicate events; an orange bar lists them so you can pick one.

### Alerts
- **Mac/desktop:** a system notification plus a popup in Obsidian while Obsidian is running (it can be in the background).
- **iPhone/iPad/Android:** a popup in Obsidian while it's open. Phones can't alert when Obsidian is closed.
- Alerts missed in the last hour show as "Missed" when you open Obsidian again.

### Embed in a note
````
```syncthing-calendar
view: month
height: 80vh
```
````
`view` can be `year`, `month`, `week`, `day` or `reminders`.

## Install

**From Obsidian:** Settings → Community plugins → Browse → search "Syncthing Calendar" → Install → Enable.

**By hand:** download `main.js`, `manifest.json` and `styles.css` from the latest release and put them in
`<vault>/.obsidian/plugins/syncthing-calendar/`, then enable the plugin in Settings → Community plugins.

- **iPhone/iPad:** the Files app hides `.obsidian`. In Obsidian set Settings → Files and links → Override
  config folder to `obsidian-config`, then create `obsidian-config/plugins/syncthing-calendar/` in your vault
  with the Files app and put the three files there.
- **Android:** use a file manager with "show hidden files" and copy into `.obsidian/plugins/syncthing-calendar/`.

## How notes are stored

```
Calendar/                       <- calendars folder (Settings)
  Work/                         <- one calendar per folder
    2026-09-10 Sprint planning.md
Reminders/                      <- reminders folder (Settings)
  Groceries/                    <- one list per folder
    2026-09-01 Oat milk.md
```

Event (Full Calendar format):
```yaml
---
title: Dentist
allDay: false
startTime: 11:00
endTime: 11:45
type: single
date: 2026-09-10
alert: 15
---
```
Multi-day: `endDate`. Weekly: `type: recurring` with `daysOfWeek: [M, W, F]`. Other repeats: `type: rrule`
with `startDate` and `rrule` (INTERVAL, UNTIL, COUNT, BYDAY, BYMONTHDAY) and `skipDates`.

Reminder:
```yaml
---
title: Call the plumber
reminder: true
due: 2026-09-10
dueTime: 16:00
repeat: weekly
completed: false
flagged: true
priority: high
---
```

## Syncthing tips
- Sync the notes; install the plugin by hand on each device instead of syncing `.obsidian`.
- Suggested `.stignore`: `.obsidian/workspace*.json`, `.obsidian/plugins/*/main.js`, `.trash`, `(?d).DS_Store`.
- Rescan in Syncthing (or wait for it) before switching devices, and don't edit the same event on two
  devices before they sync.

## Settings
Calendars folder, reminders folder, default view, default calendar, week start, 12/24-hour clock, hour
height, private file names (date + random letters instead of the title), rename notes when dates change,
desktop notifications for alerts.

## Not supported
Invitations, travel time, time zones, calendar subscriptions and alerts while Obsidian is closed. These
need a server or a background process.

## Build from source
Node 18+: `npm install`, then `npm run build` (writes `main.js`) and `npm run check` (types).

## Release hashes (v3.1.9)
```
main.js       46e2e324770328e186250e43b4d5426c3bb4bdea7caa6753d6d9e8169109fcb3
styles.css    2ce2a96c04f642a232f61d176192569acd1bbc10433bdc27e551e9a15910ac69
manifest.json b3f62ec42ead06cc05884690b01fe16846dd17fdccb6b5f1c1153b29b368483a
```

## License
MIT
