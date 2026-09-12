# Video — Phase 1c Thingino flash (Galayou G2)

**Status:** **On hold** (V1-D9) — active dev uses **Layout A-dev** (2× USB webcam). Use when flashing **G2 pan/tilt** units (11 in inventory) if IP path resumes.

| Related | Link |
|---------|------|
| **Active bench (G7)** | [14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) |
| Phase 1 bench (go2rtc) | [14-Video-Phase-1-Edge-Bench-Checklist.md](./14-Video-Phase-1-Edge-Bench-Checklist.md) |
| G2 RTSP + go2rtc wiring | [14-Video-Phase-1b-Galayou-G2-Setup.md](./14-Video-Phase-1b-Galayou-G2-Setup.md) |
| Architecture / policy | [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md) |
| Thingino hardware page | [thingino.com/cameras/20](https://thingino.com/cameras/20) |
| **Helpful video** | [YouTube — G2 Thingino flash walkthrough](https://www.youtube.com/watch?v=F3YRIqseVTk&t=219s) *(starts ~3:39)* |
| Edge scripts | [SomNet.Edge/README.md](../SomNet.Edge/README.md) |

**Goal:** Flash **one** Galayou G2 with **[Thingino](https://thingino.com/cameras/20)**, configure Wi‑Fi + RTSP on LAN, prove RTSP → go2rtc → SomNet rear panel. Stock Wansview app path is **abandoned** (broken pairing / vendor cloud).

**Explicitly out of scope:** Batch flash of remaining cameras (do after first unit sign-off); Pi production; session tokens; tunnel.

---

> **Not on the critical path.** SomNet bench sign-off uses **G7** ([Phase 1c G7](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md)). Return here for the **G2 fleet** (pan/tilt sites).

---

## Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **V1c-D1** | Firmware | **Thingino** `thingino-galayou_g2_t23n_sc2336_atbm6012bx.bin` only — **not** G7/Y4/OpenIPC generic | 2026-09-11 |
| **V1c-D2** | Stock Wansview | **Abandoned** for bench — app broken for this model | 2026-09-11 |
| **V1c-D3** | Lab unit | **One** sacrificial G2 of 11; batch others after sign-off | 2026-09-11 |
| **V1c-D4** | Primary flash path | **UART** (U-Boot shell → SD or TFTP write) — engineer has adapters | 2026-09-11 |
| **V1c-D5** | Backup / recovery | **CH341A + SOIC8 clip** recommended for stock dump before overwrite | 2026-09-11 |
| **V1c-D6** | LAN security | Router **block camera WAN** after RTSP verified (defense in depth) | 2026-09-11 |
| **V1c-D7** | SomNet stream | Prefer RTSP substream `/live/ch1` for dashboard live | 2026-09-11 |

---

## Hardware profile (confirm before flash)

| Component | Expected (G2) |
|-----------|----------------|
| SoC | Ingenic **T23N** |
| Sensor | **SC2336** |
| Wi‑Fi | **ATBM6012BX** |
| Flash | **8 MB** NOR (typically W25Q64 class) |
| SD slot | microSD under camera head (tilt head up) — use for **updates after** Thingino bootloader exists |
| USB Cloner | **Not supported** on G2 per Thingino (`Cloner mode: n/a`) |

**Wrong image bricks the unit until recovered with CH341A.** G7 uses the same chip names but a **different** `.bin` — do not cross-flash.

---

## Helpful video

Community walkthrough for Galayou G2 + Thingino (disassembly, UART, flash):  
**[YouTube — watch from ~3:39](https://www.youtube.com/watch?v=F3YRIqseVTk&t=219s)**

Use alongside this checklist — confirm firmware file is the official G2 build (`thingino-galayou_g2_t23n_sc2336_atbm6012bx.bin`), not G7/Y4.

---

## 1. Prerequisites

### Tools

- [ ] **USB‑UART adapter** — **3.3 V** logic (FT232RL, CP2102, etc.); **not** 5 V TTL without level shifter
- [ ] Dupont wires or fine probe tips
- [ ] Small Phillips screwdriver + plastic spudger (open case without cracking shell)
- [ ] PC on same LAN as camera (for post-flash config and RTSP test)
- [ ] Terminal: PuTTY, Tera Term, or `screen` / `minicom` @ **115200 8N1**
- [ ] Optional but strongly recommended: **CH341A** + **SOIC8 clip** (8 MB backup + recovery)
- [ ] Optional: FAT32 **microSD** (≤32 GB often most compatible) for U-Boot `fatload` flash path
- [ ] Optional: TFTP server on PC if using network flash from U-Boot ([Thingino wiki](https://github.com/themactep/thingino-firmware/wiki))

### Software / files

- [ ] Download latest G2 image: [thingino-galayou_g2_t23n_sc2336_atbm6012bx.bin](https://github.com/themactep/thingino-firmware/releases/latest/download/thingino-galayou_g2_t23n_sc2336_atbm6012bx.bin)
- [ ] Verify SHA256 against companion `.sha256sum` in the same [release](https://github.com/themactep/thingino-firmware/releases)
- [ ] Copy firmware to local bench folder (e.g. `D:\SomNet.Edge\firmware\`) — **do not commit**
- [ ] `ffmpeg` on PATH for [test-rtsp.ps1](../SomNet.Edge/scripts/test-rtsp.ps1)
- [ ] go2rtc running per [Phase 1 checklist](./14-Video-Phase-1-Edge-Bench-Checklist.md)

### Network

- [ ] Home **2.4 GHz** Wi‑Fi SSID + password ready (Thingino setup portal)
- [ ] Router: note whether camera WAN is currently blocked — **allow during Wi‑Fi setup only** if portal requires internet (usually LAN-only after join)

---

## 2. Pre-flight (lab unit)

- [ ] Label unit **#1 — lab / Thingino** (10 others stay boxed)
- [ ] Factory reset stock firmware optional — not required if flashing from U-Boot/CH341A
- [ ] Photograph **main PCB** (SoC, flash IC, UART pads, Wi‑Fi module) — save for batch rollout notes
- [ ] Confirm markings match **T23N + SC2336 + ATBM6012BX** (sticker or silkscreen if visible)
- [ ] Record stock MAC from label (useful for DHCP reservation later)

---

## 3. Disassembly

- [ ] Unplug USB‑C power
- [ ] Remove base / faceplate per G2 mechanical design (spudger around lens housing edge — avoid cable strain)
- [ ] Expose main board; locate:
  - [ ] **UART** test pads (often **TX / RX / GND** near SoC — may be labeled)
  - [ ] **SPI flash** IC (SOIC8, 8 MB) for optional CH341A clip
  - [ ] microSD slot location (for post-flash updates)
- [ ] Note pad layout in bench notes (§10) — batch flash will reuse this

---

## 4. Stock firmware backup *(strongly recommended)*

Skip only if accepting full brick risk on mistake.

### Option A — CH341A in-circuit read *(preferred)*

- [ ] Power **off**; clip SOIC8 to flash IC (pin 1 aligned)
- [ ] Read **8 MB** (0x800000) to `galayou-g2-stock-YYYYMMDD.bin`
- [ ] Verify read size; store offline — **do not commit to git**

### Option B — U-Boot dump to SD / UART log

- [ ] UART connected; interrupt U-Boot (§5)
- [ ] Follow [Thingino firmware docs](https://github.com/themactep/thingino-firmware/blob/master/docs/firmware.md) for `sf read` + SD dump or hex log method
- [ ] Confirm backup file before proceeding

---

## 5. UART console access

- [ ] Wire **GND ↔ GND**
- [ ] Wire adapter **TX ↔ camera RX** and **RX ↔ camera TX** (crossover)
- [ ] **Do not** connect 5 V to board — camera powered by USB‑C only
- [ ] Open serial @ **115200 8N1**; power camera
- [ ] Capture boot log to file
- [ ] During early boot, press **Ctrl+C** or **Enter** repeatedly to reach **U-Boot** prompt
- [ ] If garbled text: try **57600** baud; recheck TX/RX swap
- [ ] If no console: probe alternate pads; confirm GND; check adapter 3.3 V I/O

**Pass:** U-Boot shell responds to `help` or `printenv`.

---

## 6. Flash Thingino (pick one path)

### Path A — SD card from U-Boot *(if MMC works in stock U-Boot)*

- [ ] Format microSD **FAT32**; copy G2 `.bin` as **`autoupdate-full.bin`** at card root
- [ ] Insert SD; in U-Boot: power SD rails if needed (`gpio` / `mmc rescan` — see [Thingino troubleshooting](https://github.com/themactep/thingino-firmware/wiki/Troubleshooting))
- [ ] `fatls mmc 0` shows `autoupdate-full.bin`
- [ ] Flash sequence (8 MB example — match your flash size):

```text
setenv baseaddr 0x82000000
setenv flashsize 0x800000
mw.b ${baseaddr} 0xff ${flashsize}
fatload mmc 0:1 ${baseaddr} autoupdate-full.bin
sf probe 0; sf erase 0x0 ${flashsize}
sf write ${baseaddr} 0x0 ${filesize}
reset
```

- [ ] Camera reboots; watch UART for Thingino boot message

### Path B — CH341A write full image *(most reliable)*

- [ ] Power off; clip to flash IC
- [ ] Erase + write **`thingino-galayou_g2_t23n_sc2336_atbm6012bx.bin`** (8 MB)
- [ ] Verify chip; reassemble enough to power on
- [ ] UART: confirm Thingino boot log

### Path C — TFTP from U-Boot

- [ ] PC TFTP server on same subnet; camera on Ethernet **or** Wi‑Fi in U-Boot if supported
- [ ] Load image to RAM; `sf erase` + `sf write` as in Path A
- [ ] `reset`

**Do not use:** USB Ingenic Cloner (G2 = `n/a`); **G7** or **OpenIPC** images.

---

## 7. Post-flash — Thingino setup

- [ ] First boot: connect phone/PC to Thingino setup (AP or Ethernet — follow on-screen UART / portal hints)
- [ ] Join home **2.4 GHz** Wi‑Fi; set admin password
- [ ] Note camera **LAN IP** (router DHCP or reservation by MAC)
- [ ] Web UI: enable **RTSP** (and **ONVIF** if offered)
- [ ] Set RTSP credentials (record locally — do not commit)
- [ ] Confirm stream paths — try **`/live/ch1`** (sub) then **`/live/ch0`** (main)

Example URL:

```text
rtsp://USER:PASS@192.168.1.x:554/live/ch1
```

- [ ] Optional: firmware update via SD `autoupdate-full.bin` now that Thingino bootloader is present

---

## 8. LAN RTSP verification *(before go2rtc)*

```powershell
cd D:\MoreRepos\SomNet
.\SomNet.Edge\scripts\find-lan-rtsp.ps1
.\SomNet.Edge\scripts\test-rtsp.ps1 -Url 'rtsp://USER:PASS@192.168.1.x:554/live/ch1'
```

- [ ] `find-lan-rtsp.ps1` lists camera IP:554
- [ ] `test-rtsp.ps1` completes without error
- [ ] VLC plays same URL (optional cross-check)
- [ ] If `ch1` fails, try `ch0`; URL-encode special characters in password

---

## 9. go2rtc + SomNet integration

Follow [Phase 1b §4–5](./14-Video-Phase-1b-Galayou-G2-Setup.md) with real rear URL.

- [ ] Edit **`D:\SomNet.Edge\go2rtc.yaml`** — replace rear restream with RTSP + `#rtsp_transport=tcp`
- [ ] Restart go2rtc (`stop-go2rtc-windows.ps1` → `start-go2rtc-windows.ps1`)
- [ ] Browser: `http://localhost:1984/stream.html?src=rear&mode=mse` shows **G2 picture** (not webcam)
- [ ] Set `VITE_VIDEO_REAR_URL=/go2rtc/stream.html?src=rear` in `SomNet.UI/.env.production`
- [ ] `npm run build`; restart API (F5)
- [ ] Dashboard: **Front** = webcam, **Rear** = G2 — both play ≥2 min

---

## 10. Security (router)

- [ ] Add DHCP reservation for camera MAC → stable IP
- [ ] **Block outbound internet** for camera IP/MAC (allow LAN to edge PC/Pi only)
- [ ] Re-run `test-rtsp.ps1` — still passes after block
- [ ] Optional: Wireshark — no vendor China tunnel URLs; LAN RTSP only

---

## 11. Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V1c-T1** | UART → U-Boot or CH341A backup | Stock flash saved OR U-Boot shell reached | ☐ |
| **V1c-T2** | Write Thingino G2 `.bin` | Boot log shows Thingino; web UI reachable | ☐ |
| **V1c-T3** | Wi‑Fi + RTSP enabled | `test-rtsp.ps1` pass on `/live/ch1` or `/live/ch0` | ☐ |
| **V1c-T4** | go2rtc `src=rear` | Browser rear ≠ front picture | ☐ |
| **V1c-T5** | SomNet dashboard | Front webcam + rear G2 simultaneous ≥2 min | ☐ |
| **V1c-T6** | Router WAN block | RTSP still works; vendor egress blocked | ☐ |
| **V1c-T7** | Bench notes | §12 filled; PCB photo saved | ☐ |

---

## 12. Exit criteria (sign-off)

Phase 1c is **signed off** when:

1. **V1c-T1–T7** pass on lab unit **#1**.
2. Phase 1b steps complete — real IP rear in go2rtc ([1b guide](./14-Video-Phase-1b-Galayou-G2-Setup.md)).
3. Phase 1 **V1-T3–T6** can be completed ([Phase 1 checklist](./14-Video-Phase-1-Edge-Bench-Checklist.md)).
4. Rollout plan for remaining **10** cameras documented (reuse §3–6 notes).

**Then:** Mark Phase 1 **full IP sign-off** (optional — [Phase 3+](./16-Video-Phase-3-Session-Tokens-Checklist.md) already complete via **Layout A-dev**, V1-D10).

---

## 13. Batch rollout (after sign-off)

| Step | Action |
|------|--------|
| 1 | Use same `.bin` and documented UART/flash path |
| 2 | Backup stock optional after lab confidence |
| 3 | Unique RTSP password per site or per camera (installer policy TBD) |
| 4 | DHCP reservation + router block per camera |
| 5 | Register each in go2rtc as `rear` (or `rear-2`, …) when multi-cam sites exist — future API config |

---

## 14. Bench notes

| Field | Value |
|-------|-------|
| Date | |
| Lab unit ID | G2 #___ of 11 |
| PCB photo path | |
| UART pads location | |
| Flash method used | A SD / B CH341A / C TFTP |
| Stock backup file | |
| Thingino version / build date | |
| Camera LAN IP / MAC | |
| RTSP URL (local notes only) | |
| Stream path used | ch0 / ch1 |
| Issues / fixes | |

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No UART output | Wrong pads / baud / TX-RX | Swap TX-RX; try 57600; photo board for community ID |
| U-Boot won't interrupt | Missed timing | Power-cycle; spam Ctrl-C from first power-on |
| SD not seen in U-Boot | GPIO power/CD pins | [Thingino wiki — SD not recognized](https://github.com/themactep/thingino-firmware/wiki/Troubleshooting) |
| Boot loop after flash | Wrong image (G7 vs G2) | CH341A restore stock backup; reflash correct `.bin` |
| Wi‑Fi won't join | 5 GHz only / wrong password | 2.4 GHz SSID; WPA2; move camera near AP |
| RTSP auth fail | Credentials / path | Re-check web UI; try TCP in URL; encode `@` in password |
| go2rtc rear black | Wrong path or camera asleep | Test VLC first; `ch1` vs `ch0`; restart camera |
| RTSP dies after router block | Block too broad | Allow LAN subnet; block only WAN/default route |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial Phase 1c checklist — Thingino G2; blocks Phase 1b sign-off |
| 2026-09-11 | Helpful video — [YouTube G2 Thingino walkthrough](https://www.youtube.com/watch?v=F3YRIqseVTk&t=219s) |
| 2026-09-11 | **Deferred** — bench pivoted to G7 SD installer path |
