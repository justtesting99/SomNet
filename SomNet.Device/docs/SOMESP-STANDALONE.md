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
- **Sub ready:** **D33** **single click** (short press). With hub paused, unlock **`/operate`** first. **`POST /api/local/arm`** returns **`409 press_device_button`**.
- **Scene session:** **`POST /api/local/scene`** `{"active":true|false}` (Bearer; requires sub ready to turn on). Motion commands require **scene active**.

## RGB status (D23/D22/D1 — no serial required)

Three layers — **red = network**, **blue = sub acknowledgment** (bench RGB; was yellow R+G), **green = session / motion**:

| Color | Visual | Meaning |
|-------|--------|---------|
| Red | Flash | No Wi‑Fi (STA) or setup AP |
| Red | Solid | Wi‑Fi up — phase 0 / no operator auth yet |
| Blue | Flash | Token OK — **awaiting device button** (`awaitingDeviceButton`) |
| Blue | Solid | Sub pressed button — **ready** |
| Green | Solid | **Scene session ON** |
| Green | Flash | Run / stroke / automatic active |

Also on **`GET /api/local/status`**: `rgbState`, `subReady`, `sceneActive` (`armed` mirrors scene). Credential reset overrides with fast red flash.

## Local API

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/api/local/unlock` | — | `{"pin":"1234"}` optional `"newPin":"..."`; optional **`actuatorKind`** when NVS unbound (**M2-B2**) |
| POST | `/api/local/lock` | Bearer | Clears session + scene |
| POST | `/api/local/arm` | Bearer | Returns **`409 press_device_button`** — use **D33** |
| POST | `/api/local/scene` | Bearer | `{"active":true\|false}` — scene session (green LED) |
| POST | `/api/local/disarm` | Bearer | Scene off (`sceneActive`: false) |
| GET | `/api/local/status` | — | `subReady`, `sceneActive`, **`rgbState`**, `busy`, … |
| PUT | `/api/local/actuator-kind` | Bearer | `{"actuatorKind":"relay"\|"hbridge"}` — unlocked, **disarmed**, idle; reboot if kind changed |
| GET | `/api/local/caps` | — | **`actuatorKind`**: relay stroke limits **or** motor `minDutyPercent` / `maxDutyPercent` |
| POST | `/api/local/commands` | Bearer + **scene active** | `commandKey` + `payloadJson` |
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

**Motor profile** (`actuatorKind: hbridge` — set on **`/operate`** (Save profile), **`/config`** (`actuator_kind`), or `PUT /api/local/actuator-kind`):

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

After unlock, sub **presses D33** (ready), turn **scene** on via **`POST /api/local/scene`** or `/operate` checkbox, then POST **`/api/local/commands`** with the same **`payloadJson`** the hub sends (include `actuatorKind`, `segmentTargetRampMs`, and program fields). Example keys: `automaticMode`, duty/speed bands, `endSessionMode`, burst fields — see [PROTOCOL §6](../PROTOCOL.md) motor automatic. Poll **`GET /api/local/status`** until `automaticActive` is false and `resultJson` is present.

On setup AP, local API returns **`403 setup_mode`**.

## Actuator profile (MA-D12 LAN)

Set **`relay`** vs **`hbridge`** before motor bench (must match the module wired to the ESP):

| Where | How |
|-------|-----|
| **`/operate`** | Actuator profile dropdown → **Save profile & reboot** (unlock first) |
| **`/config`** | **Actuator profile** on the form → Save and reboot |
| **`PUT /api/local/actuator-kind`** | Bearer + `{ "actuatorKind": "hbridge" }` while idle |
| **`POST /api/local/unlock`** | Optional `{ "pin":"1234", "actuatorKind":"hbridge" }` when NVS kind **unbound** (rejects mismatch when bound) |

Status page shows current kind. **`GET /api/local/caps`** returns relay stroke limits or motor **`minDutyPercent` / `maxDutyPercent`**.

Hub pairing still sends **`actuatorKind`** on **`PairDevice`**; device NVS must agree.

## M2-E command parity runbook (curl)

Use **`env:dev`** (hub + **`SOMNET_LOCAL_API`**) or **`env:somesp`**. Replace **`BASE`** (`http://192.168.1.11`) and capture **`TOKEN`** from unlock. **Pause hub** on status toggle when testing local-only ([28 §hub competition](../../Documents/28-Scheduled-Jobs-Local-Device-Integration.md)).

```bash
BASE=http://192.168.1.11
# Unlock → copy token
curl -s -X POST "$BASE/api/local/unlock" -H "Content-Type: application/json" \
  -d '{"pin":"1234"}'
TOKEN=<paste>
AUTH="Authorization: Bearer $TOKEN"
# Arm: press D33 on the device (HTTP arm returns 409 press_device_button)
# Scene: curl -s -X POST "$BASE/api/local/scene" -H "$AUTH" -H "Content-Type: application/json" -d '{"active":true}'
curl -s "$BASE/api/local/status" -H "$AUTH"
```

### Hub vs local (M2-P0)

| Hub | Local |
|-----|-------|
| `POST /api/devices/commands` + operator JWT | `POST /api/local/commands` + Bearer + **armed** |
| `commandKey` + `payloadJson` in REST body | Same **`commandKey`** + **`payloadJson`** in JSON body |

Local body shape:

```json
{ "commandKey": "motor-run", "payloadJson": "{\"dutyPercent\":45}" }
```

(`payloadJson` is a **string** containing JSON.)

### M2-E1–E2 Motor manual

```bash
curl -s -X POST "$BASE/api/local/commands" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"commandKey":"motor-run","payloadJson":"{\"dutyPercent\":45}"}'
curl -s "$BASE/api/local/status"
curl -s -X POST "$BASE/api/local/commands" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"commandKey":"motor-stop","payloadJson":"{}"}'
```

### M2-E3–E6 Motor automatic (periodic example)

```bash
curl -s -X POST "$BASE/api/local/commands" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"commandKey":"automatic-start","payloadJson":"{\"actuatorKind\":\"hbridge\",\"segmentTargetRampMs\":-1,\"automaticMode\":\"periodic\",\"minimumDutyPercent\":20,\"maximumDutyPercent\":80,\"minimumSpeedPercent\":30,\"maximumSpeedPercent\":50,\"segmentMinSeconds\":5,\"segmentMaxSeconds\":20,\"delayBeforeStartSeconds\":0,\"rampMs\":500,\"endSessionMode\":\"minutes\",\"endSessionValue\":2,\"burstsOn\":false}"}'
# Poll until automaticActive false and resultJson set:
curl -s "$BASE/api/local/status"
curl -s -X POST "$BASE/api/local/commands" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"commandKey":"automatic-stop","payloadJson":"{}"}'
curl -s -X POST "$BASE/api/local/commands" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"commandKey":"abort","payloadJson":"{}"}'
```

(PowerShell: build `payloadJson` as a single escaped string; or use **`/operate`** UI.)

### M2-E7 Motor bursts

Add to start payload: `"burstsOn":true,"burstPlacement":"mainPlusAfterMainStroke","burstPercent":50,"burstStyle":"fixedPowerDelay",…` — same fields as hub / **`/operate`**. Expect **`burstEventsCompleted`** in terminal **`resultJson`**.

### M2-E8 Relay regression

Set profile **`relay`**. **`stroke`** / relay **`automatic-start`** with relay JSON (`minimumStrokeMs`, …) — see [PROTOCOL §6.3–6.5](./PROTOCOL.md).

### M2-E9 Cross-kind negative

With NVS **`hbridge`**, POST **`stroke`** → firmware rejects (400-class ack / error).

## Differences from `env:dev`

| Area | SomNet (`dev`) | SomEsp (`somesp`) |
|------|----------------|-------------------|
| NVS “fully provisioned” | Wi‑Fi + `server_url` | Wi‑Fi only |
| **`SOMNET_LOCAL_API`** | **`/operate` + `/api/local/*`** on STA (default **dev**) | Same + standalone provisioning |
| SignalR | When configured | Optional hybrid; off for LAN-only |
| Button D33 | Hub event when hub enabled | **Sub ready** (single click; double still works) |
| Status RGB | Legacy GPIO2 | **Red** network · **Blue** sub · **Green** session/motion |
| Session history (LittleFS) | Not mounted on **`dev`** partition | **`env:somesp`** — `/api/local/history` |

## Session history (LittleFS)

Completed strokes, bursts, and automatic summaries are stored on the **~192 KB** SPIFFS/LittleFS partition (`board_build.filesystem = littlefs` on `env:somesp`). Up to **30** events; factory reset clears history.

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/local/history` | Bearer — `{ "items": [ … ] }` |
| GET | `/api/local/history/{id}` | Bearer — full event JSON |
| DELETE | `/api/local/history` | Bearer — wipe all |

**History** — Header **History** on `/operate` opens a modal (list + detail). Same data as `GET/DELETE /api/local/history`.

**UI** — SomNet.UI-aligned shell on `/`, `/config`, and `/operate` (see [35-ESP32-Operate-UI-Parity.md](../../Documents/35-ESP32-Operate-UI-Parity.md)). Pattern **preview** graph on `/operate`; not live telemetry.
