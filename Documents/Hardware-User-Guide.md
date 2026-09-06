# SomNet Hardware — User Guide

Guide for **installers**, **device owners**, and **support staff** using the SomNet ESP32 hardware unit.

| Audience | Document |
|----------|----------|
| Installers / owners | This guide |
| Developers | [ESP32 Device Plan](./09-ESP32-Device-Plan.md) · [SomNet.Device/README](../SomNet.Device/README.md) |
| SomNet web app | [User Guide](./User-Guide.md) |
| Hub protocol | [SignalR & Hardware](./06-SignalR-And-Hardware.md) |

**Firmware status (2026-09-06):** Phases **0–8** — Wi‑Fi provisioning, SomNet pairing over SignalR, **relay control**, pairing token expiry, and **manual stroke/abort from the SomNet web app** (toolbar **Hardware** dialog for pairing). Burst/automatic hardware modes remain Phase 9.

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

1. Log in as **Dom** and select the **Sub** this device will serve.
2. Open **Options** → **Hardware device**.
3. Paste the Device ID and tap **Pair device**.

The device receives pairing over its live connection, stores credentials, and reconnects. The status page should show paired/connected state when the server and device are both online.

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
2. Open **Options** → **Hardware device**.
3. Confirm the **Device ID** (same `esp32-…` as on the device status page).
4. Tap **Pair device** again.

The server issues a **new one-year token** and sends it to the device over its live connection. Within a few seconds the status page should show **paired** and SomNet should show **connected** again.

**Tip for installers:** Note the **pair date** in your install records or maintenance calendar so the Dom can re-pair proactively before expiry — e.g. annually at the same time as other site checks. SomNet **Options → Hardware device** shows the expected expiry date when a device is paired.

### How this differs from other recovery actions

| Situation | Device Wi‑Fi / server settings | Pairing token | Fix |
|-----------|-------------------------------|---------------|-----|
| **Token expired (annual)** | Unchanged | Cleared on device | **Pair again** in SomNet UI |
| **Revoke pairing** (Dom choice) | Unchanged | Revoked on server | **Pair again** in SomNet UI |
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
| Pairing from SomNet UI | **Yes** | Toolbar **Hardware** dialog — **All Subs**, **Online now (unpaired)**, **Enter device ID**; Options links to same dialog |
| Status page shows pairing state | **Yes** | Unpaired / paired / connected indicators |
| Stroke from SomNet **web app buttons** | **Yes** | Manual mode **Stroke** → `POST /api/devices/commands`; session records device `actualStrokeMs` |
| **Abort** during long stroke | **Yes** | **Abort** while stroke pending; relay opens; session tracks abort count |
| Relay responds to server **stroke** command | **Yes** | Duration set in command payload (`strokeMs`) |
| Burst / automatic modes | **Not yet** | Phase 9 (UI buttons disabled) |

**Server URL reminder:** Use the SomNet API **LAN address** on the device (e.g. `http://192.168.1.47:5031`). The SomNet browser on the same PC can use `localhost`; the ESP32 cannot.

### Hardware dialog tabs

| Tab | What it shows |
|-----|----------------|
| **All Subs** | Every Sub’s device ID, connection state, token expiry, Pair/Revoke |
| **Online now (unpaired)** | ESP32 units connected to the server **without** a pairing token — new units, after factory reset, or after **Revoke**. Use **Pair** on a row to link to a Sub without typing the ID. |
| **Enter device ID** | Paste the ID from the device status page when the unit is not on the unpaired list yet |

**Important:** Hardware that is **already paired and online** appears on **All Subs** as **Connected**, not on **Online now**. After **Revoke**, the device reconnects unpaired and should appear on **Online now** within about 10 seconds.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot find setup Wi‑Fi | Hold button 10 s to force credential reset; look for `SomNet-Setup-XXXX` |
| Saved wrong Wi‑Fi password | Hold button 10 s → set up again |
| Setup page will not load | Confirm you are on `SomNet-Setup-XXXX` or the same LAN as the device; try `http://192.168.4.1/` on setup AP |
| Device ID needed for pairing | Status page at `http://<device-ip>/` after Wi‑Fi works, or USB serial log for installers |
| Paired but “not connected” in SomNet | Check server URL on device; confirm API is running; same LAN; Windows Firewall on dev PC may block LAN inbound port 5031 |
| Device was paired; now “not paired” after ~1 year | **Expected** — pairing token expired. Dom: Options → Hardware device → **Pair device** again (same Device ID). See [Pairing token renewal](./Hardware-User-Guide.md#pairing-token-renewal-about-once-a-year) |
| Stroke does nothing | Confirm pairing + connected status on **All Subs**; relay wiring on **D4** |
| **Online now** is empty but device works | **Expected** if already paired — check **All Subs** for **Connected** |
| Lost pairing / start over completely | On `/config`, use **Factory reset** (when reachable), or contact support |

---

## Coming later

| Feature | Target |
|---------|--------|
| Burst and automatic session modes | Phase 9 |
| LED indicators for setup / fault | Under consideration |
| QR code on status page for Device ID | Future polish |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-05 | Initial guide: provisioning, config UI, 10 s credential reset |
| 2026-09-05 | SignalR pairing, relay on D4, Options pairing path; clarified UI stroke buttons pending Phase 8 |
| 2026-09-05 | Annual pairing token expiry and re-pair procedure (Phase 7) |
