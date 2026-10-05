# SomEsp — standalone firmware (`env:somesp`)

SomEsp is a **compile-time product profile** for the ESP32 firmware: same relay/timing stack as SomNet.Device, but **no SomNet API**, **no SignalR hub**, and **no `server_url` in NVS**. You operate the device from a browser on the same LAN (control UI and local API ship in later phases).

**Plan:** [Documents/27-SomEsp-Standalone-Device-Plan.md](../../Documents/27-SomEsp-Standalone-Device-Plan.md)  
**Architecture:** [Documents/26-ESP32-Local-Offline-Mode-Design.md](../../Documents/26-ESP32-Local-Offline-Mode-Design.md) (tier 3 / Mode A)

## Build and flash

From `SomNet.Device/`:

```bash
pio run -e somesp
pio run -e somesp -t upload
pio device monitor
```

Serial banner includes **`Mode: STANDALONE`**. Firmware version is prefixed with `somesp-` (see `platformio.ini`).

## Provisioning

1. Power the board. If Wi‑Fi is not configured, join Soft‑AP **`SomNetSetup-XXXX`** (password `somnetsetup`).
2. Open **`http://192.168.4.1/`** (or the IP shown on serial).
3. Go to **Configure** and enter **Wi‑Fi SSID and password only** — no SomNet server URL.
4. Save and reboot. The device joins your home Wi‑Fi; status is at **`http://<device-ip>/`**.

`GET /api/status` returns `"standalone": true` and `"hubState": "disabled"`.

## What is different from `env:dev`

| Area | SomNet (`dev`) | SomEsp (`somesp`) |
|------|----------------|-------------------|
| NVS “fully provisioned” | Wi‑Fi + `server_url` | Wi‑Fi only |
| SignalR | Started when configured | Not started |
| Config form | Server URL required | Server URL hidden |
| Pairing | Used for hub commands | Not required for operation (future local PIN) |
| Button → hub | `ReportButtonEvent` | Ignored (serial log only) |
| Status LED | Wi‑Fi + hub | Wi‑Fi only |

## Local API (Phase 1)

Default operate PIN: **`1234`** until you store a custom value in NVS (`operate_pin`). PIN is stored in **plaintext** on the device for the trial — use only on a trusted LAN.

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/api/local/unlock` | — | Body `{"pin":"1234"}` → `token`, `expiresAtMs` (8 h TTL) |
| POST | `/api/local/lock` | Bearer | Clears session + disarm |
| POST | `/api/local/arm` | Bearer | GPIO32 accessory ON |
| POST | `/api/local/disarm` | Bearer | Accessory OFF |
| GET | `/api/local/status` | — | `unlocked`, `armed`, `busy`, `wifiConnected` |
| POST | `/api/local/commands` | Bearer + armed | **Phase 2** — returns `501` today |

Example (PowerShell):

```powershell
$u = Invoke-RestMethod -Method Post -Uri http://192.168.1.172/api/local/unlock -ContentType application/json -Body '{"pin":"1234"}'
$h = @{ Authorization = "Bearer $($u.token)" }
Invoke-RestMethod -Method Post -Uri http://192.168.1.172/api/local/arm -Headers $h
Invoke-RestMethod -Uri http://192.168.1.172/api/local/status
```

Wrong PIN → `401` with `invalid_pin`. Commands without unlock/arm → `401` / `403`.

## Control panel (`/operate`)

Open **`http://<device-ip>/operate`** on the LAN. Flow: **Unlock** (PIN) → **Arm session** → Manual or Automatic tab.

Commands use `POST /api/local/commands` with `{ "commandKey", "payloadJson" }` (same shapes as [PROTOCOL.md](./PROTOCOL.md) §6). Poll `GET /api/local/status` for `busy`, `automaticActive`, `commandComplete`, `resultJson`.

`GET /api/local/caps` returns `maxStrokeMs`, burst limits.

## Roadmap

- **Phase 4:** trial hardening, factory reset PIN, flash budget check

## Security note (trial)

Do not expose port 80 to the internet. Bearer tokens live in RAM until lock, expiry, or Wi‑Fi loss (session cleared).
