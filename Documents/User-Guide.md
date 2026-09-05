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

- **Minimum / Maximum Power (%)** — Range for random power selection
- **Minimum / Maximum Stroke (ms)** — Duration range for strokes

### Timing & Burst

Configure how automatic bursts behave (stroke count, delay, style).

### End Session Rules

Choose how the automatic session ends:

| Mode | Behavior |
|------|----------|
| **Minutes** | End after a set number of minutes |
| **Strokes** | End after a total stroke count |
| **No auto end** | Run until you press Stop |

### Actions

| Button | What it does |
|--------|--------------|
| **Start** | Begins an automatic session |
| **Stop** | Ends the running session |

Unlike manual mode, the session starts immediately when you press Start.

---

## Options

Click **Options** in the header to configure preferences and default control values for the current Dom+Sub pairing.

Settings are organized into tabs:

- **App** — Sound effects, confirmation dialogs, video expand behavior, timestamp display
- **Manual** — Default manual control values (power, stroke range, burst params)
- **Automatic** — Default automatic control values (power range, timing, end session rules)

Changes save automatically after a brief delay. Settings persist across sessions and browser restarts.

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

When hardware devices are paired, status will reflect device connectivity (requires device pairing — see technical documentation).

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
             Subs        Automatic: Start/Stop
                ↓
           Options (settings)
           Notify (schedule)
```
