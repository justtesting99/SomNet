# SomEsp — standalone firmware (`env:somesp`)

SomEsp is a **compile-time product profile** for the ESP32 firmware: same relay/timing stack as SomNet.Device, but **no SomNet API**, **no SignalR hub**, and **no `server_url` in NVS**. You operate the device from a browser on the same LAN.

**Plan:** [Documents/27-SomEsp-Standalone-Device-Plan.md](../../Documents/27-SomEsp-Standalone-Device-Plan.md)  
**Architecture:** [Documents/26-ESP32-Local-Offline-Mode-Design.md](../../Documents/26-ESP32-Local-Offline-Mode-Design.md) (tier 3 / Mode A)  
**Scheduled jobs (.NET host):** [Documents/28-Scheduled-Jobs-Local-Device-Integration.md](../../Documents/28-Scheduled-Jobs-Local-Device-Integration.md)

## End-user quick start

1. Power the ESP32 and join your home Wi‑Fi (see **Provisioning** below if it is not configured yet).
2. On a phone or PC on the **same Wi‑Fi**, open **`http://<device-ip>/`** (IP is on the serial banner or your router).
3. Tap **Control panel** or go to **`http://<device-ip>/operate`**.
4. **Unlock** with PIN **`1234`** (factory default). Optionally set **New PIN** on the same screen.
5. Tap **Arm session**, then use **Manual** or **Automatic** controls. Control values persist in the browser (`localStorage`) and on the device (**NVS**, synced via `GET`/`PUT` `/api/local/settings` after unlock). Factory reset clears NVS defaults. Unlock token stays in `sessionStorage` (re-enter PIN after refresh).

Operate and local API are **not available** on the setup Wi‑Fi (`SomNetSetup-XXXX`) — finish provisioning first.

## Build and flash

From `SomNet.Device/`:

```bash
pio run -e somesp
pio run -e somesp -t upload
pio device monitor
```

Serial banner includes **`Mode: STANDALONE`** and **`Control: http://<ip>/operate`**.

## Provisioning

1. If Wi‑Fi is not configured, join Soft‑AP **`SomNetSetup-XXXX`** (password `somnetsetup`).
2. Open **`http://192.168.4.1/`** and **Configure** — **Wi‑Fi SSID + password only**.
3. Save and reboot; use the STA IP for `/` and `/operate`.

`GET /api/status` returns `"standalone": true` and `"hubState": "disabled"` until you connect a SomNet server (see **SomNet network** below).

## SomNet network (optional hybrid)

1. On **status** (`http://<device-ip>/`), save **SomNet server URL** (API base, LAN IP, no `/hubs/hardware`). Hub connects **without reboot**.
2. Pair **Device ID** in SomNet (Dom → Sub → Options → Hardware device).
3. Use **Connect SomNet hub** on the device **status page** (or `POST /api/hub/mode`) to switch between **remote hub** and **local-only** `/operate` (pairing and `server_url` stay in NVS). Same toggle exists on **`env:dev`** when `SOMNET_LOCAL_API=1` (default hub firmware).

| API | Notes |
|-----|--------|
| `GET /api/hub/mode` | `hubEnabled`, `paired`, `hubState`, … |
| `POST /api/hub/mode` | `{"enabled":true\|false}` — requires paired + `server_url` to enable |

## Security (trial)

- **LAN only** — do not port-forward HTTP.
- Default PIN **`1234`**; change via unlock `newPin` or NVS key `operate_pin` (plaintext trial).
- **Factory reset** (`/config` → factory reset) clears NVS including PIN (back to default **1234**).
- Bearer token in RAM until lock, expiry, or Wi‑Fi loss.

## Local API

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/api/local/unlock` | — | `{"pin":"1234"}` optional `"newPin":"..."` |
| POST | `/api/local/lock` | Bearer | Clears session + disarm |
| POST | `/api/local/arm` | Bearer | GPIO32 ON |
| POST | `/api/local/disarm` | Bearer | GPIO32 OFF |
| GET | `/api/local/status` | — | `busy`, `automaticActive`, **`actuatorKind`**, `commandComplete`, `resultJson`, … — **motor** automatic/manual included in busy/automatic (M2-F1) |
| GET | `/api/local/caps` | — | **`actuatorKind`**: relay stroke limits **or** motor `minDutyPercent` / `maxDutyPercent` |
| POST | `/api/local/commands` | Bearer + armed | `commandKey` + `payloadJson` — **same JSON as hub** ([PROTOCOL.md](./PROTOCOL.md) §6) |
| GET | `/api/local/settings` | Bearer | `{ "stored": false }` or settings blob (see below) |
| PUT | `/api/local/settings` | Bearer | Saved to NVS (`loc_oper_set`); max **1536** bytes |

### Settings JSON (hub parity — M2-D)

**Relay profile** (`actuatorKind: relay`):

```json
{
  "manual": { "minimumStrokeMs": 25, "maximumStrokeMs": 400, "powerPercent": 50 },
  "automatic": { "automaticMode": "randomPowerAndTiming", "burstsOn": false },
  "activeTab": "auto"
}
```

**Motor profile** (`actuatorKind: hbridge` — set via **`/config` POST `actuator_kind=hbridge`**):

```json
{
  "motorManual": { "minimumDutyPercent": 20, "maximumDutyPercent": 80, "speedPercent": 0 },
  "motorAutomatic": {
    "automaticMode": "periodic",
    "minimumDutyPercent": 20,
    "maximumDutyPercent": 80,
    "minimumSpeedPercent": 30,
    "maximumSpeedPercent": 50,
    "segmentMinSeconds": 5,
    "segmentMaxSeconds": 20,
    "rampMs": 500,
    "endSessionMode": "minutes",
    "endSessionValue": 2,
    "burstsOn": true,
    "burstPlacement": "mainPlusAfterMainStroke",
    "burstPercent": 50
  },
  "appOptions": {
    "motorSegmentTargetRampMode": "segmentDuration",
    "motorSegmentTargetRampMs": 200
  },
  "activeTab": "auto"
}
```

PUT rejects **`motorManual` / `motorAutomatic` on relay** (`400 motor_settings_on_relay_profile`) and **`manual` / `automatic` on motor** (`relay_settings_on_motor_profile`). **`appOptions`** is motor-only.

### Motor automatic-start (curl sketch)

After unlock + arm, POST **`/api/local/commands`** with the same **`payloadJson`** the hub sends (include `actuatorKind`, `segmentTargetRampMs`, and program fields). Example keys: `automaticMode`, duty/speed bands, `endSessionMode`, burst fields — see [PROTOCOL §6](../PROTOCOL.md) motor automatic. Poll **`GET /api/local/status`** until `automaticActive` is false and `resultJson` is present.

On setup AP, local API returns **`403 setup_mode`**.

## Differences from `env:dev`

| Area | SomNet (`dev`) | SomEsp (`somesp`) |
|------|----------------|-------------------|
| NVS “fully provisioned” | Wi‑Fi + `server_url` | Wi‑Fi only |
| SignalR | When configured | Disabled |
| Button D33 clicks | Hub event | Ignored (log only) |
| Status LED | Wi‑Fi + hub | Wi‑Fi only |

## Session history (LittleFS)

Completed strokes, bursts, and automatic summaries are stored on the **~192 KB** SPIFFS/LittleFS partition (`board_build.filesystem = littlefs` on `env:somesp`). Up to **30** events; factory reset clears history.

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/local/history` | Bearer — `{ "items": [ … ] }` |
| GET | `/api/local/history/{id}` | Bearer — full event JSON |
| DELETE | `/api/local/history` | Bearer — wipe all |

**History** tab on `/operate` lists events (newest first).
