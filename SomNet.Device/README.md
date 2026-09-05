# SomNet.Device — ESP32 Firmware

PlatformIO firmware for the SomNet hardware device (ESP32 DevKit V1 clone). Lives in the SomNet repo but is **not** part of the .NET solution — build with PlatformIO in Cursor/VS Code or the `pio` CLI.

**Protocol:** [docs/PROTOCOL.md](docs/PROTOCOL.md)  
**Partitions / OTA headroom:** [docs/PARTITIONS.md](docs/PARTITIONS.md)  
**Hardware user guide:** [Documents/Hardware-User-Guide.md](../Documents/Hardware-User-Guide.md)  
**Plan:** [Documents/09-ESP32-Device-Plan.md](../Documents/09-ESP32-Device-Plan.md)  
**Phase checklists (0–6 complete):** [0](../Documents/09-ESP32-Phase-0-Checklist.md) · [1](../Documents/09-ESP32-Phase-1-Checklist.md) · [2](../Documents/09-ESP32-Phase-2-Checklist.md) · [3](../Documents/09-ESP32-Phase-3-Checklist.md) · [4](../Documents/09-ESP32-Phase-4-Checklist.md) · [5](../Documents/09-ESP32-Phase-5-Checklist.md) · [6](../Documents/09-ESP32-Phase-6-Checklist.md) · [7](../Documents/09-ESP32-Phase-7-Checklist.md) (**next**)

**Current firmware:** `0.7.0-phase7` — Phase 7 in progress: **SomNet-themed config UI** on `/` and `/config`. SignalR, stroke, relay unchanged from Phase 6.

## Hardware (default wiring)

| Silkscreen | GPIO | Role |
|------------|------|------|
| D4 | 4 | Relay |
| D33 | 33 | Button (input, pull-up) |

Change pins and relay polarity only in **`include/boardDefs.h`**.

## Prerequisites

- [PlatformIO](https://platformio.org/) (CLI or IDE extension)
- USB driver for CP2102 or CH340
- ESP32 DevKit connected

## Wi-Fi and server config (dev)

1. Copy `secrets.ini.example` → `secrets.ini` (gitignored — **never commit**).
2. Set `wifi_ssid`, `wifi_password`, and `somnet_server_host` (PC LAN IP — not `localhost` from the ESP32’s perspective).

`secrets.ini` is listed in the repo root `.gitignore`. If you ever accidentally staged it, run `git rm --cached SomNet.Device/secrets.ini` before pushing.

```ini
[secrets]
wifi_ssid = MyNetwork
wifi_password = MyPassword
somnet_server_host = 192.168.1.100
somnet_server_port = 5031
```

## Build and flash

From this directory:

```bash
pio run
pio run -t upload
pio device monitor
```

Or use the PlatformIO sidebar: **Build**, **Upload**, **Monitor** (115200 baud).

## Flash and partitions

**Partition table:** `min_spiffs.csv` (set in `platformio.ini`) — dual OTA slots ~**1.9 MB** each. Config HTML uses PROGMEM, not SPIFFS, so the large SPIFFS region from the default profile is unused.

| Metric | Typical (`0.7.0-phase7`, dev build) |
|--------|--------------------------------------|
| RAM | ~15% static |
| Flash (one OTA slot) | ~53% (~1.05 MB / 1.97 MB) |

Full notes: [docs/PARTITIONS.md](docs/PARTITIONS.md).

**After changing partition table:** run a full `pio run -t upload` once. NVS usually persists; re-pair if needed.

**Do not switch to `huge_app` / `no_ota`** if over-the-air updates are planned — those remove the second OTA bank.

---

Firmware **`0.7.0-phase7`** applies the SomNet web app palette to the on-device pages:

- Dark slate background (`#020617`), panel cards (`#0f172a`), indigo primary buttons
- Styled `/`, `/config`, and “Saved — rebooting” pages
- Shared PROGMEM CSS in `config_pages.cpp` (~1.5 KB)

**Build size (dev env, `min_spiffs`, 2026-09-05):** RAM 15.4% · Flash **53.3%** of OTA slot (1.05 / 1.97 MB) — see [PARTITIONS.md](docs/PARTITIONS.md).

Flash and open **`http://<device-ip>/`** on your phone to preview.

---

## Phase 6 behavior (relay + stroke)

Firmware **0.6.0-phase6** drives the **relay on D4** for `stroke` commands and supports **`abort`** during an active pulse.

### Flow

1. Dom sends `POST /api/devices/commands` (Swagger **Authorize** required)
2. Device validates and starts `relay_controller` pulse for `strokeMs`
3. Relay energizes → waits `strokeMs` (non-blocking FSM) → de-energizes
4. Device sends **`AckCommand`** with measured **`actualStrokeMs`** in serial `resultJson`
5. **`abort`** during a long pulse opens the relay immediately and sends **two acks** (stroke interrupted, then abort success)

Verify `RELAY_ACTIVE_HIGH` in `include/boardDefs.h` if the relay energizes at idle (flip to `false` for active-LOW modules).

### Test stroke (Swagger)

```json
POST /api/devices/commands
{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":50,\"strokeMs\":200}"
}
```

### Test abort (Swagger)

Start a long stroke, then within the pulse window:

```json
POST /api/devices/commands
{
  "subTarget": "Slv66",
  "commandKey": "abort",
  "payloadJson": "{}"
}
```

### Serial trace

```
[CMD] recv correlationId=... key=stroke
[STROKE] start strokeMs=200 powerPercent=50
[RELAY] ON
[RELAY] OFF after 200ms
[STROKE] complete success=true
[CMD] resultJson={"commandKey":"stroke",...,"actualStrokeMs":200,...}
[CMD] ack correlationId=... success=true
[HUB] AckCommand sent
```

---

## Phase 5 behavior (prior)

Firmware **0.5.0-phase5** handled **`stroke`** with a software timer stub (no GPIO). Superseded by Phase 6 relay timing.

### Flow (Phase 5)

1. Dom sends `POST /api/devices/commands` (Swagger **Authorize** required)
2. API pushes `ExecuteCommand` over SignalR
3. Device validates `deviceId`, token, dom/sub
4. **Software timer** ran for `strokeMs` (no relay GPIO)
5. Device sent **`AckCommand`** → API returned `acknowledged: true`

### Test stroke (Swagger)

```json
POST /api/devices/commands
{
  "subTarget": "Slv66",
  "commandKey": "stroke",
  "payloadJson": "{\"powerPercent\":50,\"strokeMs\":200}"
}
```

Use a short `strokeMs` (e.g. **200**) for quick feedback. Other command keys return ack `success: false`, message `"not implemented"`.

### Serial trace (Phase 5)

```
[CMD] recv correlationId=... key=stroke
[STROKE] start strokeMs=200 powerPercent=50
[STROKE] complete success=true
[CMD] resultJson={"commandKey":"stroke",...}
[CMD] ack correlationId=... success=true
[HUB] AckCommand sent
```

---

## Phase 4 behavior (prior)

Firmware **0.4.0-phase4** added outbound SignalR hub client + device pairing.

### Hub connection

- Negotiates `POST {server_url}/hubs/hardware/negotiate?negotiateVersion=1`
- WebSocket to `ws://{host}:{port}/hubs/hardware`
- **Unpaired:** `?id={connectionToken}&deviceId={esp32-MAC}`
- **Paired:** `?id={connectionToken}&access_token={device JWT}`
- SignalR JSON framing with **`0x1E`** record separator; ping/pong (`type:6`)
- Exponential backoff reconnect (1s → 60s cap)

Hub runs only in **RUNNING** mode when Wi-Fi is up and NVS has `server_url` (not in Soft-AP provisioning).

### Pairing (Dom operator)

1. Device shows **Device ID** on `http://<device-ip>/`
2. Dom logs into SomNet; selects Sub (e.g. `Slv66`)
3. **Preferred:** **Options → Hardware device** → paste device ID → **Pair device**
4. **Alternate (dev):** Swagger → login → **Authorize** → `POST /api/devices/pair?subTarget=Slv66`
5. Device receives `PairDevice`, saves token to NVS, reconnects paired
6. Verify: `GET /api/devices/status?subTarget=Slv66` (with Dom JWT) → `isConnected: true`

See [Phase 4 checklist](../Documents/09-ESP32-Phase-4-Checklist.md) and device plan §11.

### Local dev networking

- ESP32 `server_url` must use the PC **LAN IP** (not `localhost`)
- If negotiate fails with `connection refused` from ESP but Swagger works on the PC, allow inbound TCP **5031** on Windows Firewall (Private network)
- **Production (Azure):** device connects outbound to cloud — end-user PC firewall is not involved

---

## Phase 4 — boot modes and config UI (still current)

| Mode | When | Wi-Fi | Config UI |
|------|------|-------|-----------|
| **PROVISIONING** | NVS not fully provisioned **and** no `secrets.ini` Wi-Fi | Soft-AP `SomNet-Setup-{last4}` | `http://192.168.4.1/` |
| **RUNNING** | NVS provisioned **or** `secrets.ini` fallback | STA | `http://<device-ip>/` |

**Fully provisioned** = `provisioned` flag + non-empty `wifi_ssid` + `server_url` in NVS.

### Config UI routes

| URL | Purpose |
|-----|---------|
| `/` | Status — device ID (for SomNet pairing), Wi-Fi, server URL |
| `/config` | Edit Wi-Fi, server URL, friendly name, installer contact |
| `/api/status` | JSON status |
| `/config/reset-wifi` | Clear Wi-Fi/server → reboot to provisioning |
| `/config/factory-reset` | Clear all NVS (including pairing) → reboot |

**Server URL** must be the API base only (e.g. `http://192.168.1.100:5031`) — **no** `/hubs/hardware` suffix. `https://` sets the TLS flag for Phase 4.

### Credential reset (button)

See **[Hardware User Guide](../Documents/Hardware-User-Guide.md#wrong-wi-fi-password-or-need-to-change-network)** for the end-user procedure.

Hold **D33** for **10 seconds** (warning at 5 s) to clear **Wi-Fi and server settings** only, then reboot:

- Clears `wifi_ssid`, `wifi_pass`, `server_url`, and the provisioned flag
- Keeps device ID, friendly name, and pairing data (if any)
- After reboot: uses `secrets.ini` fallback (dev) or Soft-AP **`SomNet-Setup-XXXX`** (production)

Serial: `[BTN] keep holding 10s to reset Wi-Fi / server credentials...` → `[NVS] credential reset — clearing Wi-Fi and server settings`

Full **factory reset** (all NVS including pairing) is still available on **`/config`** when the device is reachable on the LAN.

### Provisioning flow (first boot or after credential reset)

1. Device broadcasts Soft-AP **`SomNet-Setup-XXXX`** (open, no password).
2. On phone/laptop, join that network.
3. Open **`http://192.168.4.1/`** → **Configure**.
4. Enter home Wi-Fi SSID/password and SomNet server URL → **Save and reboot**.
5. Device joins your LAN; serial logs `[HTTP] Config UI: http://<ip>/`.
6. On the same LAN, open the status page and copy **Device ID** for SomNet pairing (Phase 4).

### Dev fallback (`secrets.ini`)

If NVS is not provisioned but `secrets.ini` has Wi-Fi credentials, the device skips Soft-AP and connects using compile-time values (same as Phase 2). Use the config UI to migrate settings into NVS, or use the button credential reset / `/config` reset when you need to re-enter Wi-Fi.

### Security note

**Do not port-forward** the ESP32 HTTP server to the internet. The config UI has no authentication — it is intended for trusted LAN access only.

## Phase 3 behavior (prior)

Firmware **0.3.0-phase3** adds a LAN config web UI on port **80**.

- **Device ID:** `esp32-{MAC}` uppercase, persisted in NVS namespace `somnet`
- **Banner:** real device ID + raw MAC address
- **Credential reset:** hold button **D33** for **10 s** (see Phase 3 section above)
- Wi-Fi from NVS when provisioned; otherwise compile-time `secrets.ini` until first POST `/config`

## Phase 1 behavior (prior)

- Serial banner with firmware version and placeholder device ID
- Non-blocking Wi-Fi connect with exponential backoff retry
- Stub modules for SignalR, NVS identity, config UI, and command execution (later phases)

## Log prefixes

| Prefix | Module |
|--------|--------|
| `[BOOT]` | Startup |
| `[WIFI]` | Wi-Fi manager |
| `[CMD]` | Command handler |
| `[RELAY]` | Relay controller (Phase 6+) |
| `[NVS]` | NVS / credential reset |
| `[BTN]` | Button input |
| `[HTTP]` | Config web server |
| `[HUB]` | SignalR hub client |
| `[STROKE]` | Single-pulse mode (Phase 5+) |
| `[ID]` | Device identity |

## Project layout

```
include/          boardDefs.h, config.h
src/              firmware modules + modes/
docs/             PROTOCOL.md
tools/            Phase 0 capture scripts (Node, not part of firmware build)
```
