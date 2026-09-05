# SomNet Hardware — User Guide

Guide for **installers**, **device owners**, and **support staff** using the SomNet ESP32 hardware unit. This document grows as firmware features ship.

For firmware development, see [ESP32 Device Plan](./09-ESP32-Device-Plan.md). For the SomNet web application, see [User Guide](./User-Guide.md).

---

## What you have

The SomNet device is a small Wi‑Fi controller that connects to your SomNet server on the local network. Each unit has a **unique Device ID** (based on its hardware address) used when pairing to a Sub in SomNet.

**On the default dev kit:**

| Part | Label | Purpose |
|------|-------|---------|
| Setup button | **D33** | Reset Wi‑Fi / server settings (hold 10 seconds) |
| Relay output | **D4** | Controlled by SomNet commands (future phases) |
| USB | — | Power and optional service access (developers) |

Production enclosures may label the button differently; the **10 second hold** behavior is the same.

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

In SomNet (Dom account → select Sub → **Pair device**), paste that ID. Pairing in the web UI is the supported method; the device does not ask for your SomNet login.

---

## Wrong Wi‑Fi password or need to change network

If Wi‑Fi credentials were mistyped or the network changed, the device **cannot** be reached at its old IP. Use **credential reset**:

### Hold the setup button for 10 seconds

1. Power the device on (or leave it running).
2. Press and **hold the button (D33)** for **10 seconds**.
   - At about **5 seconds**, the device indicates a reset is pending (serial log if connected to USB; future builds may add an LED pattern).
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
| Status | `http://<device-ip>/` | Device ID, pairing state, server URL |
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

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot find setup Wi‑Fi | Hold button 10 s to force credential reset; look for `SomNet-Setup-XXXX` |
| Saved wrong Wi‑Fi password | Hold button 10 s → set up again |
| Setup page will not load | Confirm you are on `SomNet-Setup-XXXX` or the same LAN as the device; try `http://192.168.4.1/` on setup AP |
| Device ID needed for pairing | Status page at `http://<device-ip>/` after Wi‑Fi works, or USB serial log for installers |
| Lost pairing / start over completely | On `/config`, use **Factory reset** (when reachable), or contact support |

---

## Coming soon

Features not yet available on shipped firmware; this section will be updated per release.

| Feature | Status |
|---------|--------|
| Live connection to SomNet (SignalR) | Planned — Phase 4 |
| Pairing confirmation on device status page | Planned — Phase 4 |
| Relay / session control from SomNet | Planned — later phases |
| LED indicators for setup / fault | Under consideration |
| QR code on status page for Device ID | Future polish |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-05 | Initial guide: provisioning, config UI, 10 s credential reset |
