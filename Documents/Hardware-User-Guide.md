# SomNet Hardware — User Guide

Guide for **installers**, **device owners**, and **support staff** using the SomNet ESP32 hardware unit.

| Audience | Document |
|----------|----------|
| Installers / owners | This guide |
| Developers | [ESP32 Device Plan](./09-ESP32-Device-Plan.md) · [SomNet.Device/README](../SomNet.Device/README.md) |
| SomNet web app | [User Guide](./User-Guide.md) |
| Hub protocol | [SignalR & Hardware](./06-SignalR-And-Hardware.md) |

**Firmware status (2026-09-07):** Phases **0–9 Part 2** — manual **stroke / abort / burst** and **automatic Start/Stop/Abort** from the web app. Firmware **`0.9.1-phase9p2`**. Burst-in-automatic (Bursts On) → [Phase 10 checklist](./09-ESP32-Phase-10-Checklist.md).

---

## What you have

The SomNet device is a small Wi‑Fi controller that connects **outbound** to your SomNet server. Each unit has a **unique Device ID** (based on its hardware address) used when pairing to a Sub in SomNet.

**On the default dev kit:**

| Part | Label | Purpose |
|------|-------|---------|
| Setup button | **D33** | Reset Wi‑Fi / server settings (hold 10 seconds) |
| Relay output | **D4** | Drives the air valve relay — energized during a **stroke** command from SomNet |
| USB | — | Power and optional service access (developers / support) |

Production enclosures may label the button differently; the **10 second hold** behavior is the same.

When a stroke command runs, the relay energizes for the requested duration (milliseconds to seconds, set by the operator’s power settings in SomNet), then de-energizes. You may see the relay module’s built-in indicator LED during that time.

---

## First-time setup

### 1. Power on

Connect USB power (or your installed power supply). The device boots in under a minute.

### 2. Join the setup network (new or unconfigured devices)

If the device has never been configured (or was reset — see below), it creates a Wi‑Fi network:

**Network name:** `SomNet-Setup-XXXX` (last four characters of the Device ID)  
**Password:** none (open network)

On a phone or laptop, join that network.

### 3. Open the setup page

In a browser, go to:

**http://192.168.4.1/**

Tap **Configure** and enter:

| Field | Required | Notes |
|-------|----------|--------|
| **Wi‑Fi SSID** | Yes | Your home or site Wi‑Fi name — exact spelling |
| **Wi‑Fi password** | Yes | Case-sensitive; double-check before saving |
| **SomNet server URL** | Yes | API base only, e.g. `http://192.168.1.100:5031` — **do not** add `/hubs/hardware` |
| Friendly name | No | Label for this unit (e.g. “Garage controller”) |
| Installer contact | No | Optional note for support |

Tap **Save and reboot**. The device joins your Wi‑Fi and restarts.

### 4. Find the device on your network

After reboot, the device uses your normal Wi‑Fi. On another device **on the same network**, open:

**http://\<device-ip\>/**

The IP is shown on the status page once you know it; installers may use their router’s device list or ask support.

### 5. Pair in SomNet

On the device **status page**, copy the **Device ID** (format `esp32-…`).

In SomNet:

1. Log in as **Dom** and select the **Sub** this device will serve (used when pairing from **Online now**).
2. Click **Hardware** in the toolbar.
3. Use **Enter device ID** (paste the ID) or **Online now (unpaired)** if the device appears there → **Pair**.

The device receives pairing over its live connection, stores credentials, and reconnects. **Hardware → All Subs** should show **Connected** when the server and device are both online.

**Note:** The device does not ask for your SomNet login — pairing is always initiated from the SomNet app by an authenticated Dom.

---

## Pairing token renewal (about once a year)

Each paired device holds a **time-limited credential** issued by the SomNet server. In normal production use that credential is valid for **365 days** (one year). The device checks expiry automatically; it does **not** renew itself in the background.

### What happens when the token expires

| Where | What you see |
|-------|----------------|
| **SomNet UI** | Device shows **not connected** (or paired but waiting) — commands will not reach the hardware |
| **Device status page** | **Pairing: not paired** and **Hub: connected (unpaired)** — Wi‑Fi and server link are fine; only the auth token was cleared |

This is **expected**. The unit stays on your network and keeps talking to the server in “unpaired” mode until a Dom pairs it again.

### What the Dom should do

No factory reset or Wi‑Fi re-setup is required.

1. Log in as **Dom** and select the **Sub** that uses this device.
2. Open toolbar **Hardware** → **All Subs** or **Enter device ID**.
3. Confirm the **Device ID** (same `esp32-…` as on the device status page).
4. Tap **Pair** again.

The server issues a **new one-year token** and sends it to the device over its live connection. Within a few seconds the status page should show **paired** and SomNet should show **connected** again.

**Tip for installers:** Note the **pair date** in your install records or maintenance calendar so the Dom can re-pair proactively before expiry — e.g. annually at the same time as other site checks. **Hardware → All Subs** shows the expected expiry date when a device is paired.

### How this differs from other recovery actions

| Situation | Device Wi‑Fi / server settings | Pairing token | Fix |
|-----------|-------------------------------|---------------|-----|
| **Token expired (annual)** | Unchanged | Cleared on device | **Pair again** in SomNet **Hardware** dialog |
| **Revoke pairing** (Dom choice) | Unchanged | Revoked on server | **Pair again** in SomNet **Hardware** dialog |
| **10 s button — credential reset** | Cleared | **Kept** if already paired | Re-enter Wi‑Fi + server URL only |
| **Factory reset** on `/config` | Cleared | Cleared | Full setup + pair from scratch |

Developers testing expiry locally may use a **much shorter** token lifetime (minutes) in server config — that is for lab use only, not production behavior.

---

## Wrong Wi‑Fi password or need to change network

If Wi‑Fi credentials were mistyped or the network changed, the device **cannot** be reached at its old IP. Use **credential reset**:

### Hold the setup button for 10 seconds

1. Power the device on (or leave it running).
2. Press and **hold the button (D33)** for **10 seconds**.
   - At about **5 seconds**, the device logs a warning on serial (USB); future builds may add an LED pattern.
3. Release after 10 seconds. The device clears **Wi‑Fi and server settings only**, then reboots.
4. Follow **First-time setup** again (join `SomNet-Setup-XXXX` → **http://192.168.4.1/config**).

**What is kept:** Device ID, friendly name, installer contact, and SomNet pairing (if already paired).  
**What is cleared:** Wi‑Fi SSID, Wi‑Fi password, server URL, and the “provisioned” flag.

This is the main recovery path for end users who mistyped a password.

### Automatic recovery (no button)

If the device cannot connect after saving settings, firmware may eventually start the setup network automatically after several failed attempts. If you are stuck, the **10 second button hold** is the reliable fix.

---

## When already connected to Wi‑Fi

If the device is on your network and you can open its web page:

| Page | URL | Use |
|------|-----|-----|
| Status | `http://<device-ip>/` | Device ID, pairing/connection state, server URL |
| Configure | `http://<device-ip>/config` | Change Wi‑Fi, server, friendly name |
| Reset Wi‑Fi / server | Button on `/config` | Same as credential reset, then reboot |
| Factory reset | Button on `/config` | Clears **all** settings including pairing — use only when decommissioning or starting completely fresh |

**Security:** Do not expose the device’s web page to the internet (no port forwarding). It is intended for trusted local network access only.

---

## Device ID

- Format: **`esp32-`** followed by 12 hexadecimal characters (from the unit’s MAC address).
- **Stable** across reboots and Wi‑Fi credential resets.
- **Read-only** on the device — never editable in the setup form.
- Required for pairing the physical unit to a Sub in SomNet.

---

## SomNet connection and relay (current firmware)

| Capability | Available? | Notes |
|------------|------------|--------|
| Device connects to SomNet server (SignalR) | **Yes** | After Wi‑Fi + server URL configured and device paired |
| Pairing from SomNet UI | **Yes** | Toolbar **Hardware** — **All Subs**, **Online now (unpaired)**, **Enter device ID** |
| App settings (not hardware) | **Yes** | Toolbar **Options** — General, Notifications, Account |
| Status page shows pairing state | **Yes** | Unpaired / paired / connected indicators |
| Stroke from SomNet **web app** | **Yes** | Manual mode **Stroke** → device ack + session from `resultJson` |
| **Burst** from SomNet **web app** | **Yes** | Manual mode **Burst** — fixed stroke count + delay; device runs full sequence |
| **Abort** during stroke or burst | **Yes** | Relay opens; session tracks abort / partial burst from device `resultJson` |
| Automatic modes | **Yes** | Automatic tab **Start/Stop/Abort** — seven programs; session summary from device on Stop, Abort, or end rule |

**Server URL reminder:** Use the SomNet API **LAN address** on the device (e.g. `http://192.168.1.47:5031`). The SomNet browser on the same PC can use `localhost`; the ESP32 cannot.

### Hardware dialog tabs

| Tab | What it shows |
|-----|----------------|
| **All Subs** | Every Sub’s device ID, connection state, token expiry, Pair/Revoke |
| **Online now (unpaired)** | ESP32 units connected to the server **without** a pairing token — new units, after factory reset, or after **Revoke**. Use **Pair** on a row to link to a Sub without typing the ID. |
| **Enter device ID** | Paste the ID from the device status page when the unit is not on the unpaired list yet |

**Important:** Hardware that is **already paired and online** appears on **All Subs** as **Connected**, not on **Online now**. After **Revoke**, the device reconnects unpaired and should appear on **Online now** within about 10 seconds.

---

## Automatic mode

**Status (2026-09-07):** **Available** — select **Automatic** in SomNet, configure a program, press **Start**. Session history uses device-measured stroke count and duration when you **Stop**, **Abort**, or when an end-session rule fires.

**Developer detail:** [Phase 9 Part 2 — Automatic checklist](./09-ESP32-Phase-9-Part2-Automatic-Checklist.md) (signed off)

### What automatic mode is

- Operator selects **Automatic** in SomNet, configures the program, presses **Start**.
- SomNet sends **one configuration snapshot** to the device; the **ESP32 runs the full session locally** (gaps between strokes, power changes, end rules) until **Stop**, **Abort**, or **End Session After**.
- Unlike **manual burst** (fixed number of strokes you choose each time), automatic mode runs **ongoing single strokes** according to the selected **program** — with optional randomness or waves between min/max power and timing settings.
- **Bursts during automatic** (Bursts On checkbox) — planned [Phase 10](./09-ESP32-Phase-10-Checklist.md); not yet available on device.

### Seven automatic programs (Automatic Mode dropdown)

| Program | What it does (plain language) |
|---------|-------------------------------|
| **Periodic** | Steady rhythm — fixed **maximum power**, fixed **maximum** time between strokes |
| **Random Power Only** | Random strength between min/max power; steady **maximum** gap between strokes |
| **Random Timing Only** | Fixed **maximum** power; random wait between min/max seconds |
| **Random Power and Timing** | Random power **and** random wait each stroke |
| **Power Wave** | Power breathes up and down (triangle/sine) between min/max; steady gap |
| **Power and Timing Wave** | Power **and** wait time both wave (faster/harder ↔ slower/gentler) |
| **Build-Up** | One ramp from gentle/slow (min power, long gaps) to intense/fast (max power, short gaps) |

Power maps to **how long the valve stays open** (same as manual mode). Longer open time + adequate air pressure = stronger effect at the tool.

### Which controls grey out for each program

Only **Minimum power** and **Minimum (sec) time between strokes** change with the dropdown (plus rules below for End Session):

| Program | Minimum power | Minimum (sec) between strokes |
|---------|---------------|-------------------------------|
| Periodic | disabled | disabled |
| Random Power Only | enabled | disabled |
| Random Timing Only | disabled | enabled |
| Random Power and Timing | enabled | enabled |
| Power Wave | enabled | disabled |
| Power and Timing Wave | enabled | enabled |
| Build-Up | enabled | enabled |

When a minimum control is disabled, the device uses the **maximum** setting for that dimension (fixed power or fixed gap).

### End Session After

| Setting | Use |
|---------|-----|
| **Minutes** | Stop after N minutes |
| **Strokes** | Stop after N strokes |
| **No AutoEnd** | Run until operator presses **Stop** (not available for **Build-Up** or **wave** programs — they need a defined length to shape the ramp or wave) |

**Stop** ends the session cleanly and records stroke count and duration from the device. **Abort** immediately opens the relay and ends the session with an **(aborted)** summary — use it when you need to cut off mid-stroke. Auto-end (minutes/strokes rule) finishes without pressing Stop.

In the SomNet UI **Controls** panel: **Start** when idle; **Stop** is always shown (disabled until a session runs); **Abort** appears only while a session is running.

For **wave** programs, the device uses your End Session value to calculate how long one full power “breath” takes (peak-to-peak timing is derived from that — see developer checklist). For **Build-Up**, End Session is the length of the single ramp.

### What operators should expect at the tool

Automatic mode controls **relay open time**, not tank pressure. On a charged compressor with no pump during the session, **line pressure slowly drops**. Adjust **power** or **maximum stroke** if impact softens — do not expect every stroke to feel identical when pressure is changing.

Reported **`actualStrokeMs`** in session history reflects what the device measured on the relay; small variation (a few ms) between strokes is normal.

### Not yet available

| Feature | When |
|---------|------|
| **Bursts On** during automatic | [Phase 10](./09-ESP32-Phase-10-Checklist.md) |
| **Change settings while running** (live replan) | Future — original product supported this; needs mid-session device updates |

## Relay timing validation (oscilloscope)

Firmware reports **measured** pulse time in **`actualStrokeMs`** (USB serial `[RELAY]` log and SomNet session/history). **Initial scope validation (2026-09-06)** on **D4** confirmed that these values match **relay module input** (GPIO pulse):

| Requested stroke | Scope (D4) | Typical `actualStrokeMs` |
|------------------|------------|---------------------------|
| 25 ms | 25.8 ms | ~26 ms |
| 201 ms | ~208 ms | **207 ms** (burst — matches relay input) |

**Takeaway:** What you see in SomNet history and serial logs is what the relay **input** received — not a software guess. Over-run is roughly **~3%** of commanded time (~0.8 ms at 25 ms, ~6 ms at 201 ms). No user-facing correction is applied to requested stroke times today.

### Bench testing notes (2026-09-06)

Further USB-serial testing at **201 ms** commanded (`strokeMs=201`) showed:

| Mode | Typical `[RELAY] OFF after …` | Notes |
|------|-------------------------------|--------|
| **Single stroke** | **211 ms** (most runs) | Consistent median; **occasional** 207–213 ms |
| **Burst** (15 × 201 ms, 1 s gap) | **207–209 ms** (strokes 2+) | Stroke **1** often **211 ms** (same as single) |

**Why values differ slightly**

- The device turns the relay off on the **next firmware loop pass** after the requested duration — not on a dedicated hardware timer interrupt. Wi‑Fi, SignalR, and serial logging share that loop, so pulse width can vary by **~±5 ms** (rarely a bit more).
- **Single** and **burst** use the **same** relay timing code; burst looks more variable only because many strokes are logged back-to-back.
- **`[RELAY] OFF after …` is measured at GPIO turn-off** — before any network ack. For **burst**, the server receives **one** result when the whole sequence finishes; per-stroke relay times in serial do **not** affect when SomNet updates mid-burst.
- Relay **contact** (screw-terminal) output and **air at the valve** were not fully characterized in this session; mechanical pick-up/drop-out and line pressure are separate from GPIO timing.

For calibration or support, use the **median** of several strokes at a setpoint rather than a single reading.

**Future firmware (developers):** Tighter GPIO timing (`esp_timer`, optimized poll, optional dual-core task) is documented but **not planned** until needed — see [Phase 7 checklist §G2](./09-ESP32-Phase-7-Checklist.md#g2-future--relay-timing-precision-deferred) and [Device plan §6](./09-ESP32-Device-Plan.md#future--relay-timing-precision-optional). OTA dual-bank layout is unaffected.

Details and decision record: [Phase 6 checklist — timing calibration](./09-ESP32-Phase-6-Checklist.md#post-sign-off--timing-calibration).

### Air line, pressure, and what operators should adjust

SomNet controls **how long the valve relay is energized** (`strokeMs`, derived from power % and min/max stroke settings). **Impact at the tool** also depends on **air pressure at the valve** when the stroke fires.

Typical install: a compressor charges a tank; the session runs **without the pump running**, so line pressure **gradually falls** during use. A regulator holds pressure within a band, but some tolerance is normal. **Effective strike force ≈ valve open time × available air pressure** at that moment.

From an operator or Dom perspective:

- Adjust **power %** (or min/max stroke range in settings) so the **felt impact** matches intent — not to chase ±5 ms on the serial log.
- If impact softens late in a session, **raise power slightly** or **raise maximum stroke** so the same percentage still delivers enough air for the current line pressure.
- GPIO/`actualStrokeMs` timing is validated separately from pneumatic behavior; do not expect millisecond-perfect repeatability at the tool tip when tank pressure is changing.

### Optional follow-up (installers)

| Step | Action |
|------|--------|
| 1 | Pair device; run Manual **Stroke** at known min/max settings |
| 2 | Probe **D4** (or relay module input) — confirm active-high matches module behavior |
| 3 | Compare scope pulse width to **actualStrokeMs** in session and serial log |
| 4 | **Air-line pressure** at the valve — separate from GPIO timing; optional pressure gauge during a session |
| 5 | Relay **NO contacts** (load side) — optional; may differ slightly from input timing |

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot find setup Wi‑Fi | Hold button 10 s to force credential reset; look for `SomNet-Setup-XXXX` |
| Saved wrong Wi‑Fi password | Hold button 10 s → set up again |
| Setup page will not load | Confirm you are on `SomNet-Setup-XXXX` or the same LAN as the device; try `http://192.168.4.1/` on setup AP |
| Device ID needed for pairing | Status page at `http://<device-ip>/` after Wi‑Fi works, or USB serial log for installers |
| Paired but “not connected” in SomNet | Check server URL on device; confirm API is running; same LAN; Windows Firewall on dev PC may block LAN inbound port 5031 |
| Device was paired; now “not paired” after ~1 year | **Expected** — pairing token expired. Dom: **Hardware** → **Pair** again (same Device ID). See [Pairing token renewal](./Hardware-User-Guide.md#pairing-token-renewal-about-once-a-year) |
| Stroke does nothing | Confirm pairing + **Connected** on **Hardware → All Subs**; relay wiring on **D4** |
| Burst stops early | Check **Abort** was not pressed; review session for `strokesCompleted` vs requested count |
| **Online now** is empty but device works | **Expected** if already paired — check **All Subs** for **Connected** |
| Lost pairing / start over completely | On `/config`, use **Factory reset** (when reachable), or contact support |

---

## Coming later

| Feature | Target |
|---------|--------|
| Automatic session programs (timing/power variations) | [Automatic mode](#automatic-mode) — **available** (Phase 9 Part 2) |
| Automatic bursts during session | [Phase 10](./09-ESP32-Phase-10-Checklist.md) |
| Live settings change during automatic playback | Future |
| Air-line pressure timing vs GPIO pulse | Optional installer follow-up — operators tune power / max stroke for felt impact |
| LED indicators for setup / fault | Under consideration |
| QR code on status page for Device ID | Future polish |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-05 | Initial guide: provisioning, config UI, 10 s credential reset |
| 2026-09-05 | SignalR pairing, relay on D4; Options pairing path (Phase 4 dev) |
| 2026-09-05 | Annual pairing token expiry and re-pair procedure (Phase 7) |
| 2026-09-06 | Initial oscilloscope validation on D4 — `actualStrokeMs` matches relay input (25→25.8 ms, 201→207 ms serial) |
| 2026-09-06 | Bench notes: single/burst poll jitter (~±5 ms); air-line pressure vs operator power adjustment |
| 2026-09-06 | Link to Phase 7 §G2 / device plan — deferred timing options (`esp_timer`, poll, dual-core; OTA-safe) |
| 2026-09-07 | Automatic mode overview — **signed off**; Start/Stop/Abort; auto-end via end-session rules |
