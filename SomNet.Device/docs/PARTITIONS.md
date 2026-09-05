# ESP32 flash partition layout

**Locked in Phase 7 (2026-09-05):** `board_build.partitions = min_spiffs.csv` in `platformio.ini`.

## Why `min_spiffs`

| Profile | OTA slot size | SomNet fit (2026-09-05) |
|---------|---------------|-------------------------|
| `default.csv` (was implicit) | ~1.28 MB / slot | **79.9%** — tight for future OTA + `wss` + Phase 9 |
| **`min_spiffs.csv` (current)** | **~1.875 MB / slot** | **53.3%** — headroom for OTA client, TLS, burst/auto |

SomNet does **not** use SPIFFS (config HTML is PROGMEM). Shrinking SPIFFS enlarges both OTA app slots with no feature loss.

## Layout (4 MB flash, `min_spiffs.csv`)

| Partition | Purpose |
|-----------|---------|
| `nvs` | Pairing token, Wi-Fi, device ID (`Preferences` namespace `somnet`) |
| `otadata` | Active OTA slot selector (required before OTA updates ship) |
| `app0` / `app1` | Dual-bank firmware — **each binary must fit in one slot** |
| `spiffs` | Minimal (unused by current firmware) |

## Build monitoring

Watch **Flash** line from `pio run` — it reports **used / one OTA slot size**, not total chip flash.

**Guideline:** treat **>85% of slot size** as a warning before adding large features or shipping OTA.

Example (dev env, `0.7.0-phase7`):

```
RAM:   15.4% (50 544 / 327 680)
Flash: 53.3% (1 047 377 / 1 966 080)
```

## First flash after partition change

Switching from `default` → `min_spiffs` changes partition boundaries. Use a **full upload** (`pio run -t upload`). NVS usually survives (same `nvs` region); if pairing or Wi-Fi is lost, re-provision from `/config`.

## OTA (future)

OTA implementation is **not** in firmware yet (device plan non-goal until post–Phase 9). This partition table **prepares** dual-bank OTA so future binaries can use ~1.9 MB per slot.

Do **not** use `huge_app.csv` or `no_ota.csv` — those sacrifice dual-bank OTA.

## Reference

- [ESP32 partition tables](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/partition-tables.html)
- [Device plan §10 Phase 7](../../Documents/09-ESP32-Device-Plan.md)
