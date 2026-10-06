# SomEsp — standalone firmware (`env:somesp`)

SomEsp is a **compile-time product profile** for the ESP32 firmware: same relay/timing stack as SomNet.Device, but **no SomNet API**, **no SignalR hub**, and **no `server_url` in NVS**. You operate the device from a browser on the same LAN.

**Plan:** [Documents/27-SomEsp-Standalone-Device-Plan.md](../../Documents/27-SomEsp-Standalone-Device-Plan.md)  
**Architecture:** [Documents/26-ESP32-Local-Offline-Mode-Design.md](../../Documents/26-ESP32-Local-Offline-Mode-Design.md) (tier 3 / Mode A)

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

`GET /api/status` returns `"standalone": true` and `"hubState": "disabled"`.

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
| GET | `/api/local/status` | — | `busy`, `automaticActive`, `commandComplete`, `resultJson`, … |
| GET | `/api/local/caps` | — | `maxStrokeMs`, burst limits |
| POST | `/api/local/commands` | Bearer + armed | `commandKey` + `payloadJson` — [PROTOCOL.md](./PROTOCOL.md) §6 |
| GET | `/api/local/settings` | Bearer | `{ "stored": false }` or `{ "manual", "automatic", "activeTab" }` |
| PUT | `/api/local/settings` | Bearer | Same JSON shape; saved to NVS (`loc_oper_set`) |

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
