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

## Roadmap (not in Phase 0)

- **`/operate`** — manual + automatic browser UI  
- **`/api/local/*`** — PIN unlock, arm/disarm, commands (same `payloadJson` as [PROTOCOL.md](./PROTOCOL.md) §6)

## Security note (trial)

Local PIN and tokens are planned for Phase 1. Until then, treat the device HTTP surface as **LAN-trust** only — do not expose port 80 to the internet.
