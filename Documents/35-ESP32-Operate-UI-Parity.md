# ESP32 `/operate` UI — SomNet.UI parity (feature branch)

**Branch:** `feature/esp32-ui-parity`  
**Scope:** Visual layout and flow only; `/api/local/*` behavior unchanged.

## What changed

- **Shared stylesheet** — `SomNet.Device/src/web_ui_shared.{h,cpp}` (slate/indigo shell, panels, status pill, toggles). Used by `/`, `/config`, and `/operate`.
- **`/operate`** — Full-screen PIN gate; wide dashboard (controls left, pattern preview right on desktop); header status pill; Manual | Automatic segmented mode; Scene header toggle; History modal; **Focus device** dropdown (single local device today, populated from `GET /api/status`).
- **Pattern preview** — Canvas graph from current manual/automatic fields (seeded illustrative schedule, not live segment telemetry). Live “now” marker can follow in a later pass if status exposes segment samples.
- **Size** — Phase 3 ~20 KB HTML cap is **not** enforced on this branch; UI assets live in flash PROGMEM (~1.2 MB app image on `env:dev` after build).

## Future: master ESP + slave devices

Product idea (not implemented): one **master** ESP serves `/operate` for multiple **slave** devices on the LAN. Focus dropdown would list slaves; slaves would expose read-only or relay-only endpoints. Document here for planning when multi-device standalone returns.

## Out of scope (unchanged)

- Video, Dom/Sub auth, Accessory toggle (no `/api/local/accessory`), full React graph parity, hub segment store.
