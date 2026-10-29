# ESP32 `/operate` UI — SomNet.UI parity (feature branch)

**Branch:** `feature/esp32-ui-parity`  
**Scope:** Visual layout and flow only; `/api/local/*` behavior unchanged.

## What changed

- **Shared stylesheet** — `SomNet.Device/src/web_ui_shared.{h,cpp}` (slate/indigo shell, panels, status pill, toggles). Used by `/`, `/config`, and `/operate`.
Documents/35-ESP32-Operate-UI-Parity.md
- **Pattern preview** — Canvas graph aligned with SomNet.UI `relayPowerSchedule` / `motorSpeedSchedule`: stroke/gap pulses, table modes (power wave, power+timing wave, build-up), burst clusters, motor segment ramps (incl. periodic flat hold). **Live** graph still from `relay-automatic-segment` / `motor-automatic-segment` in `/api/local/status` `resultJson` (yellow now marker).
- **Size** — Phase 3 ~20 KB HTML cap is **not** enforced on this branch; UI assets live in flash PROGMEM (~1.2 MB app image on `env:dev` after build).

## Future: master ESP + slave devices

Product idea (not implemented): one **master** ESP serves `/operate` for multiple **slave** devices on the LAN. Focus dropdown would list slaves; slaves would expose read-only or relay-only endpoints. Document here for planning when multi-device standalone returns.

## Roadmap (feature branch)

- [x] External stylesheet `/ui/somnet.css` (avoids HTML buffer overflow)
- [x] Automatic min/max **power** and motor **speed** range sliders with stroke/ms hints
- [x] **Session running** banner during automatic
- [x] **Live graph** from `relay-automatic-segment` / `motor-automatic-segment` in `/api/local/status` `resultJson` (yellow now marker)
- [x] Status `/` — same app shell as `/operate` (header pill polling `/api/status`, two-column dashboard, ui-panels)
- [x] Relay preview — bursts, power/timing wave, stroke end horizon
- [x] Motor automatic preview — segment ramps + burst clusters (Options ramp mode)
- [x] Session history on **`env:dev`** (LittleFS + local ack recording)

## Out of scope (unchanged)

- Video, Dom/Sub auth, Accessory toggle (no `/api/local/accessory`), full React graph parity, hub segment store.
