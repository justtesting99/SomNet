# User Guide

SomNet is a web application for managing sessions between a **Dom** (controller) and a **Sub** (participant). This guide explains how to use the application from an operator's perspective.

## Getting Started

### Opening the Application

In development, navigate to:

**http://localhost:5031**

The application runs as a single web page — no installation required beyond having the server running.

### Signing In

1. Enter your **username** and **password** on the login screen
2. Click **Sign in**

**Demo account** (development only):

| Field | Value |
|-------|-------|
| Username | `demo` |
| Password | `demo` |

To create a new account, use the registration option on the login form (if enabled). Usernames must be 3–32 characters (letters, numbers, underscore, hyphen). Passwords must be at least 8 characters.

Your session stays signed in until the token expires (about 8 hours) or you click **Sign out**.

---

## Main Screen Layout

After signing in, you see the application header and main content area.

### Header

| Element | Action |
|---------|--------|
| **Dom name** (your display name) | Click to view all your sessions across subs |
| **Sub name** | Click to select or manage subs |
| **Notify** | Schedule a session notification |
| **Status indicator** | Shows system/device connection state |
| **Switch mode** | Return to mode selection (ends active session) |
| **History** | View session and notification timeline for current sub |
| **Options** | Configure app preferences and default control settings |
| **Sign out** | End session and log out |

---

## Selecting a Sub

Every session and settings profile is tied to a specific **Sub** (participant name).

1. Click the **Sub name** in the header
2. The Sub Selection dialog opens showing available subs
3. Click a sub name to select it
4. Settings and history reload for that pairing

### Adding a Sub

1. Open the Sub Selection dialog
2. Type a new name in the add field (2–32 characters, must start with a letter)
3. Click **Add** — the sub is available immediately

Suggested names include `Slv66`, `Slv67`, `Slv68`, but any valid name works.

### Removing a Sub

1. Open the Sub Selection dialog
2. Click **Remove** next to the sub name
3. Confirm the removal

Removing a sub deletes its saved settings. Past session history for that sub remains in the database but the sub no longer appears in your list.

> **Note:** Changing subs while a session is active will end the current session first.

---

## Choosing a Mode

After selecting a sub, choose how you want to operate:

| Mode | Best for |
|------|----------|
| **Manual** | Hand-triggered strokes and bursts — full control over each action |
| **Automatic** | Hands-off sessions with configured timing, power ranges, and end rules |

Click **Manual** or **Automatic** to enter that mode. The dashboard appears with controls on one side and a video monitor area on the other.

---

## Manual Mode

Manual mode lets you trigger individual actions.

### Power Settings

- **Minimum / Maximum Stroke (ms)** — Duration range mapped from power level
- **Power slider** — Vertical slider from 0% to 100% with tick marks every 10%
- The computed stroke duration (ms) displays based on your power setting

Adjustments save automatically for this Dom+Sub pairing.

### Burst Settings

- **Burst Strokes** — Number of strokes in a burst
- **Burst Delay (seconds)** — Pause between burst strokes

### Actions

| Button | What it does |
|--------|--------------|
| **Stroke** | Single stroke at current power level |
| **Burst** | Executes a burst sequence (strokes with delay) |
| **Abort** | Ends the current session |

Buttons show a brief pending state while the command is processed.

**Session behavior:** A session starts automatically when you perform your first stroke or burst. Each action updates the session record. Abort ends the session and records the summary.

---

## Automatic Mode

Automatic mode runs a session based on your configured parameters.

### Power Settings

- **Minimum / Maximum Power (%)** — The **power envelope for the entire automatic session**. Main-program strokes and burst strokes both resolve inside this range.
- **Minimum / Maximum Stroke (ms)** — Duration range for strokes (maps power % to relay open time)

### Timing Between Strokes

- **Minimum / Maximum (sec)** — Gap range between **main program** strokes (**UI minimum 1 second** each; program-dependent — some modes fix min or max)

### Burst Settings

When **Bursts On** is checked, burst clusters are inserted at even intervals during the session:

- **Percent (0–100)** — How many burst **events** spread across the session (e.g. 10% over 8 strokes → 1 burst event)
- **Burst Style** — Fixed or random power/delay inside each burst
- **Burst Stroke Power (relative 0–100 scale)** — **Relative to Power Settings above** (scale 0 = session min, 100 = session max). UI **Min** field ≥ **1**; **Max** may use 0–100. Defaults **1–100** for full-strength bursts; lower max (e.g. **40**) allows **lighter “break” strokes** between main strokes
- **Delay between burst strokes** — Gap **inside** each burst cluster; UI **Min** ≥ **1** sec (max may be 0 for back-to-back intra-burst strokes on device)
- **Number of strokes in each burst** — Min/max strokes per burst event

Burst Settings are **locked while a session is running** unless you enable **Allow automatic mode overrides** in Options → General (see below).

See [Hardware User Guide — Bursts during automatic](./Hardware-User-Guide.md#bursts-during-automatic) and [Phase 10 checklist](./09-ESP32-Phase-10-Checklist.md).

### End Session Rules

Choose how the automatic session ends:

| Mode | Behavior |
|------|----------|
| **Minutes** | End after a set number of minutes |
| **Strokes** | End after a number of **main program** strokes (strokes inside burst clusters do not count toward the limit) |
| **No auto end** | Run until you press Stop |

### Actions

| Button | What it does |
|--------|--------------|
| **Start** | Begins an automatic session |
| **Stop** | Ends the running session cooperatively (finishes current stroke, or entire current burst when bursts are on). **Abort stays available** if you need to cut off immediately. |
| **Abort** | Immediately opens the relay and ends the session (shown only while a session is running) |

Unlike manual mode, the session starts immediately when you press Start.

### Changing settings during a session

By default, automatic settings are **locked** while a session is running (same as the original Phase 10 behavior).

To adjust power, timing, program mode, end-session rules, or burst settings **during** a session:

1. Open **Options → General**
2. Enable **Allow automatic mode overrides while a session is running**
3. Return to Automatic mode — settings become editable
4. Changes save automatically and are sent to the device after the **current stroke completes**

A helper banner explains that changes apply after the current stroke. **Delay before start** stays locked once a session has begun.

**Important:** Do not refresh the browser during an active automatic session if you need Stop/Abort — the UI may show Start as available even though the device is still running (known limitation; session continues on device).

A **visual session timeline or graph** (preview before start or replay in history) is planned for a future release — not available yet.

---

## Options

Click **Options** in the header to configure preferences and default control values for the current Dom+Sub pairing.

Settings are organized into tabs:

- **General** — Sound effects, confirmation dialogs, video expand behavior, timestamp display, **allow automatic mode overrides while running**, system status reconnect interval
- **Notifications** — Notification preferences
- **Account** — Operator display name and password

Default control values for **Manual** and **Automatic** modes are edited on each mode page (not in Options). Changes save automatically after a brief delay (400 ms). Settings persist across sessions and browser restarts.

---

## History

Click **History** to view the timeline for the current Dom+Sub pair.

The timeline shows:

- **Sessions** — Date, mode, and summary (e.g. "2 strokes at 60%, 1 burst at 75%")
- **Notifications** — Scheduled session announcements

Use the date range picker to filter entries.

### Dom Sessions

Click your **Dom name** in the header to see all sessions across every sub you operate. Filter by sub using the dropdown.

---

## Notifications

Click **Notify** to schedule an upcoming session notification.

1. Set the **session date and time**
2. Optionally customize the **subject** (default: "Upcoming Session")
3. Click send

The notification appears in the history timeline. Email delivery is planned for a future release — currently the notification is recorded in the system only.

---

## Video Monitor

The dashboard includes a video monitor area. Depending on your app options:

- Video may expand to full screen on mobile when you perform a stroke or burst
- Expand target can be configured in Options (none, monitor 1, monitor 2, or both)

---

## System Status

The status indicator in the header shows connection state:

| State | Meaning |
|-------|---------|
| **Online** | System connected |
| **Offline** | No connection |
| **Connecting** | Attempting connection |
| **Unknown** | Status not yet determined |

When hardware devices are paired, status reflects device connectivity for the selected Sub. Click the **Hardware** button in the header to pair, revoke, or view pairing token expiry. Pairing credentials expire after about **one year**; the Dom must **pair the device again** (same Device ID — no Wi‑Fi re-setup). See the [Hardware User Guide](./Hardware-User-Guide.md#pairing-token-renewal-about-once-a-year).

---

## Tips

- **Switch mode** ends your active session — use it when changing between manual and automatic
- **Settings are per sub** — each sub remembers its own power levels and preferences
- **Sign out** ends any active session before logging out
- **Power slider ticks** mark 10% increments for precise control
- Session summaries group identical strokes and bursts for readable history

---

## Troubleshooting

| Problem | Try this |
|---------|----------|
| Kicked to login screen | Session expired — sign in again |
| Settings not saving | Check network connection; ensure a sub is selected |
| Refreshed page during automatic session — Start enabled, Stop disabled | Expected v1 behavior — device may still be running; wait for session to end on device or avoid refresh mid-session |
| Live setting change had no effect | Enable **Allow automatic mode overrides** in Options → General |
| Sub not in list | Add it via the Sub Selection dialog |
| Changes after refresh lost | Mode selection resets on refresh — re-select manual/automatic |
| Button stays pending | Wait a moment; if stuck, refresh the page |

For technical issues, server logs, or hardware pairing, refer to the [Development Guide](./08-Development-Guide.md) and [SignalR & Hardware](./06-SignalR-And-Hardware.md) documentation.

---

## Quick Reference

```
Sign in → Select Sub → Choose Mode → Operate → Review History
                ↓              ↓
           Add/Remove     Manual: Stroke/Burst/Abort
             Subs        Automatic: Start/Stop/Abort
                ↓
           Options (settings)
           Notify (schedule)
```
