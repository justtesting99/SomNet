# Video — Phase 1c Thingino flash (Galayou G7)

**Status:** **On hold** (V1-D9) — not blocking SomNet dev. Active path: **Layout A-dev** (2× USB webcam). Resume when revisiting IP camera hardware.

> **2026-09-11:** Stock Wansview iPhone app cannot provision G2/G7. Thingino G7: `sd.img` + flash glitch — no Thingino AP. SomNet continues without IP rear ([Phase 1 §6 partial sign-off](./14-Video-Phase-1-Edge-Bench-Checklist.md#6-exit-criteria-sign-off)).

| Related | Link |
|---------|------|
| Phase 1 bench (go2rtc) | [14-Video-Phase-1-Edge-Bench-Checklist.md](./14-Video-Phase-1-Edge-Bench-Checklist.md) — **1a pass; 1b blocked here** |
| G7 RTSP + go2rtc wiring | [14-Video-Phase-1b-Galayou-G7-Setup.md](./14-Video-Phase-1b-Galayou-G7-Setup.md) |
| G2 flash *(deferred)* | [14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md](./14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md) — pan/tilt fleet later |
| Architecture / policy | [13-Video-And-Camera-Architecture.md](./13-Video-And-Camera-Architecture.md) |
| Thingino hardware page | [thingino.com/cameras/21](https://thingino.com/cameras/21) (G7 2K) |
| SD card installer | [wltechblog/galayou-g7](https://github.com/wltechblog/thingino-installers/tree/main/galayou-g7) |
| Install walkthrough | [WL Tech Blog — Thingino install (YouTube)](https://www.youtube.com/watch?v=7RaU1ghMkVk) |
| Hardware ID (variants) | [YouTube Short — identify SoC / Wi‑Fi chip](https://youtube.com/shorts/8dlMDv3GmZ0) |
| Flash glitch / unbrick | [unbricker.wltechblog.com](https://unbricker.wltechblog.com/) · [unbrick video](https://www.youtube.com/watch?v=xQa9lV9r4_g) |
| Installer videos | [WL Tech Blog YouTube](https://www.youtube.com/@wltechblog) |
| Edge scripts | [SomNet.Edge/README.md](../SomNet.Edge/README.md) |

**Goal:** Flash **one** Galayou **G7** with **[Thingino](https://thingino.com/cameras/21)**, configure Wi‑Fi + RTSP on LAN, prove RTSP → go2rtc → SomNet rear panel.

**Stock Wansview app:** **Abandoned** for bench — iPhone pairing failed on G2 and G7.

**Explicitly out of scope:** G2 fleet flash (11 units — deferred); Pi production; session tokens; tunnel.

---

**When resumed:** Completing this checklist unlocks [Phase 1b G7](./14-Video-Phase-1b-Galayou-G7-Setup.md) and **full** Phase 1 sign-off (real IP on `rear`).

---

## Locked decisions

| ID | Decision | Choice | Date |
|----|----------|--------|------|
| **V1c-D1** | Bench camera | **Galayou G7 2K** (fixed mount, rear / tool view) | 2026-09-11 |
| **V1c-D2** | Firmware | **Thingino** `thingino-galayou_g7_t23n_sc2336_atbm6012bx.bin` — **not** G2/Y4/OpenIPC | 2026-09-11 |
| **V1c-D3** | Primary flash path | **[wltechblog SD installer](https://github.com/wltechblog/thingino-installers/tree/main/galayou-g7)** — boot-from-SD image (`sd.img`), not a loose `.bin` copy | 2026-09-11 |
| **V1c-D4** | Expect disassembly | **Open case** for microSD access + PCB verify; **flash glitch** often required when stock FW ignores installer | 2026-09-11 |
| **V1c-D4b** | Fallback flash | UART / CH341A / [unbricker](https://unbricker.wltechblog.com/) image | 2026-09-11 |
| **V1c-D5** | Stock Wansview | **Abandoned** — app broken on iPhone for Galayou models tested | 2026-09-11 |
| **V1c-D6** | LAN security | Router **block camera WAN** after RTSP verified | 2026-09-11 |
| **V1c-D7** | SomNet stream | Prefer RTSP substream `/live/ch1` for dashboard live | 2026-09-11 |
| **V1c-D8** | G2 inventory | **Deferred** — use [G2 checklist](./14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md) when flashing pan/tilt units | 2026-09-11 |

---

## Hardware profile (confirm before flash)

| Component | Expected (G7 2K) |
|-----------|------------------|
| SoC | Ingenic **T23N** |
| Sensor | **SC2336** |
| Wi‑Fi | **ATBM6012BX** |
| Flash | **8 MB** NOR |
| SD slot | microSD (location varies — check unit; often under base or board) |
| Mount | **Fixed** bullet — ideal for rear tool-result view |

**Wrong image bricks the unit until recovered with CH341A.** G2 and G7 share chip names but use **different** `.bin` files — do not cross-flash.

---

## 0. What the wltechblog installer actually does *(read first)*

This is **not** “copy a `.bin` to a FAT32 card and reboot.” The [galayou-g7.zip](https://github.com/wltechblog/thingino-installers/tree/main/galayou-g7) contains **`sd.img`** — a small bootable SD image built by wltechblog that includes:

| On the SD card | Purpose |
|----------------|---------|
| **Thingino U-Boot** (T23N MSC) | Camera **boots from SD** instead of stock bootloader |
| **`autoupdate-full.bin`** | G7 Thingino firmware written to internal 8 MB flash |

```text
Power on + SD inserted
    → camera loads U-Boot from SD
    → U-Boot flashes internal NOR from autoupdate-full.bin
    → reboot → Thingino setup Wi‑Fi AP
```

**Why it often fails “out of the box”:**

1. **microSD is inside the case** — G7 bullet: you must **disassemble** to insert the card ([install video](https://www.youtube.com/watch?v=7RaU1ghMkVk) shows this pattern on similar cams).
2. **Stock firmware may not boot the SD installer** — vendor FW can ignore the card; you then need a **flash glitch** (brief short on flash chip pins 5–6 while powering on) to force the SD boot path ([community report](https://github.com/themactep/thingino-firmware/discussions/1219), [unbricker tool](https://unbricker.wltechblog.com/)).
3. **Wrong hardware variant** — if Wi‑Fi chip ≠ ATBM6012BX, install can boot but **no Thingino AP** ([W7 troubleshooting pattern](https://github.com/wltechblog/thingino-installers/tree/main/wansview-w7)).
4. **No guaranteed stock backup** — G7 installer README does **not** promise reversibility; use **CH341A read** before first flash if you need rollback ([wltechblog README](https://github.com/wltechblog/thingino-installers/blob/main/README.md)).

**Installer status:** G7 image marked **“being tested”** — have UART/CH341A ready.

---

## 1. Prerequisites

### Tools

- [ ] **microSD card** (any size; installer is only a few MB)
- [ ] **SD imager** — [Raspberry Pi Imager](https://www.raspberrypi.com/software/) or Rufus — writes **`sd.img`**, not a FAT32 file copy
- [ ] **Disassembly tools** — plastic spudger, small Phillips (G7 SD slot is **internal**)
- [ ] **Flash glitch** — fine tweezers / wire to **briefly** short **SOIC8 pins 5↔6** on the **NOR flash IC** (not the SoC)
- [ ] PC on same LAN as camera (post-flash config + RTSP test)
- [ ] **Recommended:** **USB‑UART** @ 3.3 V (boot log proves whether SD U-Boot ran)
- [ ] **Recommended:** **CH341A** + SOIC8 clip (8 MB stock backup before overwrite)

### Software / files

- [ ] Download **[galayou-g7.zip](https://github.com/wltechblog/thingino-installers/raw/main/galayou-g7/galayou-g7.zip)** from [wltechblog installers](https://github.com/wltechblog/thingino-installers/tree/main/galayou-g7)
- [ ] Read installer README — marked **“being tested”**; community reports success
- [ ] Fallback firmware: [thingino-galayou_g7_t23n_sc2336_atbm6012bx.bin](https://github.com/themactep/thingino-firmware/releases/latest/download/thingino-galayou_g7_t23n_sc2336_atbm6012bx.bin) + verify SHA256
- [ ] `ffmpeg` on PATH — [test-rtsp.ps1](../SomNet.Edge/scripts/test-rtsp.ps1)
- [ ] go2rtc running per [Phase 1 checklist](./14-Video-Phase-1-Edge-Bench-Checklist.md)

### Network

- [ ] Home **2.4 GHz** Wi‑Fi SSID + password (for Thingino setup portal)
- [ ] Phone or PC to join Thingino setup AP during first boot

### Support

- [ ] [WL Tech Blog YouTube](https://www.youtube.com/@wltechblog) — model-specific install videos
- [ ] [Hacker's Homestead Discord](https://discord.gg/s6yJzhS4hD) — installer troubleshooting

---

## 2. Pre-flight (lab unit)

- [ ] Label unit **G7 #1 — lab / Thingino**
- [ ] Confirm model **Galayou G7 2K** USB-powered Wi‑Fi (not solar / 4G — unsupported per [wltechblog](https://github.com/wltechblog/thingino-installers/blob/main/README.md))

---

## 3. Disassemble + verify hardware *(before flashing)*

- [ ] **Power off**; open G7 case (spudger around lens/base seam — see [install video](https://www.youtube.com/watch?v=7RaU1ghMkVk))
- [ ] Locate **microSD slot** on PCB; confirm you can insert/remove card with case open
- [ ] Photograph PCB; identify:
  - [ ] SoC **T23N** (not T31 — wrong installer if T31)
  - [ ] Wi‑Fi **ATBM6012BX** ([ID short](https://youtube.com/shorts/8dlMDv3GmZ0))
  - [ ] **SOIC8 NOR flash** (for glitch + CH341A) — pin 1 dot marked
  - [ ] **UART** pads (TX / RX / GND) optional but useful
- [ ] **Optional CH341A backup now:** read **8 MB** → `galayou-g7-stock-YYYYMMDD.bin` (installer may **not** create backup)

---

## 4. Prepare the SD installer card

1. [ ] Download **`galayou-g7.zip`** from [galayou-g7/](https://github.com/wltechblog/thingino-installers/tree/main/galayou-g7)
2. [ ] **Unzip** — inside is **`sd.img`** only (not `autoupdate-full.bin` alone)
3. [ ] Write **`sd.img`** to microSD — **raw disk image**, not “copy file to FAT32”:
   - **Balena Etcher:** *Flash from file* → select **`sd.img`** (unzipped). Etcher may accept the `.zip` if it finds `sd.img` inside — verify success screen shows ~4–8 MB target, not “1 file copied”.
   - **Raspberry Pi Imager:** *Use custom image* → `sd.img`
   - **Rufus:** DD / ISO mode → `sd.img`
4. [ ] **Wrong ways** (camera will sit and flash LED, no Wi‑Fi):
   - Format SD FAT32 and drag **`thingino-….bin`** onto it
   - Flash the standalone **`.bin`** from [Thingino releases](https://github.com/themactep/thingino-firmware/releases) instead of **`sd.img`**
   - Etcher “success” but source was wrong file — re-check unzipped contents

**Verify on PC after write:** Windows may show a small (~4–8 MB) partition or prompt to format — **do not reformat**. If the card still looks like an empty 64 GB FAT32 volume with a loose `.bin` file, the write failed — redo step 3.

---

## 5. Flash attempt A — SD boot *(no glitch)*

1. [ ] **Power off**; insert prepared microSD
2. [ ] **Power on**; wait **2–5 minutes**
3. [ ] Watch for **Thingino setup Wi‑Fi** (new SSID — not stock `WVC…` serial name)

| Result | Meaning | Next |
|--------|---------|------|
| **Solid LED → then flashing** | Boot or flash **in progress** — wait **3–5 min** before concluding failure | Scan Wi‑Fi; see **§5b** |
| **Thingino Wi‑Fi AP** | Success | → **§8** post-flash setup |
| **Stock `WVC…` AP** | SD installer did not run | → **§6** flash glitch |
| **Flashing ≥5 min, no new AP** | Stock “connecting Wi‑Fi” *or* wrong Wi‑Fi variant | §6 glitch; open case + verify chip |
| **Blue LED, motors move, no Wi‑Fi** | Wrong Wi‑Fi variant image | Re-check PCB; wrong `.bin`/installer |
| **No motor activity / dead** | Possible brick | → **§7** unbrick / CH341A |

### 5b. LED solid → constant flash *(in progress — you may be here)*

Stock G7 manual: **flashing blue = “connecting to Wi‑Fi.”** That pattern appears for **both** stock firmware and mid-install boots — **LED alone is not pass/fail**.

**Do now (leave power on for now):**

1. [ ] Note **how long** it has been powered (allow **≥3–5 minutes** total on first attempt).
2. [ ] On iPhone: **Settings → Wi‑Fi** — scan for:
   - **Thingino** setup SSID (new name — **not** your home SSID, **not** `WVC…` serial)
   - **`WVC…`** — stock firmware still running → installer likely **did not** flash yet
3. [ ] Note flash **speed**: slow (~1 Hz) vs fast vs very regular constant blink.
4. [ ] **Do not remove SD or power-cycle** until 5 min elapsed unless LED goes **solid** (connected) or **off** (dead).

| After 5 min | Wi‑Fi you see | Next step |
|-------------|---------------|-----------|
| Thingino AP | — | **§8** — join AP, configure Wi‑Fi + RTSP |
| Only `WVC…` or home router (camera joined old network) | Stock FW | **§6** — power off, **flash glitch**, retry |
| **No new networks**, LED still flashing | Install stuck or wrong variant | Open case; confirm T23N + ATBM6012BX; **§6** glitch; UART log if you have adapter |
| LED **solid** blue | Stock thinks Wi‑Fi connected | Check router DHCP for new camera; if stock FW, still need **§6** for Thingino |

---

## 6. Flash attempt B — SD + flash glitch *(required if §5 fails)*

Stock firmware often **never boots the SD U-Boot** without glitching the NOR flash ([discussion #1219](https://github.com/themactep/thingino-firmware/discussions/1219)). Correct **`sd.img`** on the card is still required.

### 6a. Setup

- [ ] **`sd.img`** written to microSD (§4) — card stays inserted for entire procedure
- [ ] Case **open** — flash IC and SD slot accessible
- [ ] **Unplug USB** — camera fully off
- [ ] Optional: UART **115200 8N1** on TX/RX/GND — log helps confirm SD boot

### 6b. Find the flash chip (not the SoC)

| IC | Look |
|----|------|
| **Flash (short this)** | Small **SOIC-8**, often **Winbond W25Q…** / “25Q64” — **8 MB** |
| **SoC (do NOT short)** | Larger **Ingenic T23** package |

Pin 1 = dot/notch. Counter-clockwise numbering:

```text
        ● 1 ─────────── 8 VCC
          2             7
          3             6 CLK  ┐ short
          4 GND       5 MOSI ┘ these (pins 5 ↔ 6)
```

### 6c. Glitch procedure *(repeat up to 2× before §6d)*

1. [ ] SD inserted; USB **unplugged**
2. [ ] Tweezers/wire on **flash pins 5 and 6** only
3. [ ] **Hold short** → plug in USB power
4. [ ] Keep short **~0.5–1 s** → **release**
5. [ ] **Do not power-cycle** — wait **2–3 minutes**
6. [ ] iPhone Wi‑Fi scan: **Thingino** setup AP?

**Timing tips**

- Too **short** (<200 ms): may miss — retry
- Too **long** (>2 s): unnecessary — release by 1 s
- Some boards want glitch **twice** (off 10 s, repeat) — try once more before unbricker

### 6d. If `galayou-g7.zip` glitch still fails

1. [ ] **[unbricker.wltechblog.com](https://unbricker.wltechblog.com/)** → Galayou G7 / T23N → download zip
2. [ ] Unzip **`work.img`** → Etcher to **fresh** microSD
3. [ ] Repeat **§6c** with unbricker card ([video](https://www.youtube.com/watch?v=xQa9lV9r4_g))

**Pass:** Thingino setup Wi‑Fi visible → **§8**.

---

## 7. Flash attempt C — UART / CH341A *(if A + B fail)*

### C1 — UART + manual SD flash from U-Boot

- [ ] Serial **115200 8N1** on TX/RX/GND
- [ ] Interrupt stock or SD U-Boot (**Ctrl+C**)
- [ ] FAT32 SD with [G7 `.bin`](https://github.com/themactep/thingino-firmware/releases/latest/download/thingino-galayou_g7_t23n_sc2336_atbm6012bx.bin) as **`autoupdate-full.bin`**
- [ ] `mmc rescan`; `fatload` + `sf erase` + `sf write` ([Thingino wiki — SD flash](https://github.com/themactep/thingino-firmware/wiki/Troubleshooting))

### C2 — CH341A in-circuit write

- [ ] Restore from backup if experimenting; else read backup first
- [ ] Write **`thingino-galayou_g7_t23n_sc2336_atbm6012bx.bin`** (8 MB)
- [ ] Power on; confirm Thingino via UART or setup AP

**Do not use:** G2 `.bin`; USB Cloner (G7 = `Cloner mode: n/a` on [Thingino G7 page](https://thingino.com/cameras/21)).

---

## 8. Post-flash — Thingino setup

- [ ] Join Thingino setup Wi‑Fi from phone/PC
- [ ] Configure home **2.4 GHz** Wi‑Fi + admin password
- [ ] Note camera **LAN IP** (router DHCP or reserve by MAC)
- [ ] Web UI: enable **RTSP** (and **ONVIF** if offered)
- [ ] Set RTSP credentials (local notes only — do not commit)
- [ ] Confirm stream paths — try **`/live/ch1`** (sub) then **`/live/ch0`** (main)
- [ ] **Recommended:** full firmware upgrade after installer — weekly installer snapshots are not latest ([wltechblog note](https://github.com/wltechblog/thingino-installers/tree/main/wansview-w7)); use web UI **sysupgrade** or SD `autoupdate-full.bin` from [latest release](https://github.com/themactep/thingino-firmware/releases)

Example URL:

```text
rtsp://USER:PASS@192.168.1.x:554/live/ch1
```

---

## 9. LAN RTSP verification *(before go2rtc)*

```powershell
cd D:\MoreRepos\SomNet
.\SomNet.Edge\scripts\find-lan-rtsp.ps1
.\SomNet.Edge\scripts\test-rtsp.ps1 -Url 'rtsp://USER:PASS@192.168.1.x:554/live/ch1'
```

- [ ] `find-lan-rtsp.ps1` lists camera IP:554
- [ ] `test-rtsp.ps1` completes without error
- [ ] VLC plays same URL (optional)
- [ ] If `ch1` fails, try `ch0`; URL-encode special characters in password

---

## 10. go2rtc + SomNet integration

Full wiring: [Phase 1b — G7 setup §4–5](./14-Video-Phase-1b-Galayou-G7-Setup.md).

- [ ] Edit **`D:\SomNet.Edge\go2rtc.yaml`** — replace rear restream with RTSP + `#rtsp_transport=tcp`
- [ ] Restart go2rtc
- [ ] Browser: `http://localhost:1984/stream.html?src=rear&mode=mse` shows **G7 picture** (not webcam)
- [ ] `VITE_VIDEO_REAR_URL=/go2rtc/stream.html?src=rear` → `npm run build` → restart API
- [ ] Dashboard: **Front** = webcam, **Rear** = G7 — both play ≥2 min

---

## 11. Security (router)

- [ ] DHCP reservation for camera MAC
- [ ] **Block outbound internet** for camera (LAN to edge only)
- [ ] Re-run `test-rtsp.ps1` after block
- [ ] Optional: confirm no vendor cloud egress (Wireshark / router logs)

---

## 12. Smoke tests

| # | Steps | Pass criteria | Result |
|---|-------|---------------|--------|
| **V1c-T1** | SD installer OR fallback flash | Thingino setup AP / web UI reachable | ☐ |
| **V1c-T2** | Wi‑Fi + RTSP enabled | `test-rtsp.ps1` pass on `/live/ch1` or `/live/ch0` | ☐ |
| **V1c-T3** | go2rtc `src=rear` | Browser rear ≠ front picture | ☐ |
| **V1c-T4** | SomNet dashboard | Front webcam + rear G7 simultaneous ≥2 min | ☐ |
| **V1c-T5** | Router WAN block | RTSP still works | ☐ |
| **V1c-T6** | Bench notes | §14 filled | ☐ |

---

## 13. Exit criteria (sign-off)

Phase 1c (G7) is **signed off** when:

1. **V1c-T1–T6** pass on lab G7.
2. [Phase 1b G7 setup](./14-Video-Phase-1b-Galayou-G7-Setup.md) complete — real IP rear in go2rtc.
3. Phase 1 **V1-T3–T6** can be completed ([Phase 1 checklist](./14-Video-Phase-1-Edge-Bench-Checklist.md)).
4. Remaining G7 box + G2 fleet documented for later rollout.

**Then:** Mark Phase 1 **full IP sign-off** (optional — [Phase 3+](./16-Video-Phase-3-Session-Tokens-Checklist.md) already complete via **Layout A-dev**, V1-D10).

---

## 14. Bench notes

| Field | Value |
|-------|-------|
| Date | |
| Lab unit | G7 #___ |
| Flash path | A SD boot / B SD+glitch / C UART / CH341A |
| Flash glitch needed? | Y / N |
| PCB SoC / Wi‑Fi confirmed | |
| Stock backup file | |
| Thingino version | |
| Camera LAN IP / MAC | |
| RTSP URL (local notes only) | |
| Stream path | ch0 / ch1 |
| SD installer worked first try? | Y / N |
| Issues / fixes | |

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Copied `.bin` to FAT32 card | Wrong prep — need **`sd.img`** burn | §4 — unzip `galayou-g7.zip`; Pi Imager custom image |
| Stock `WVC…` Wi‑Fi after SD boot | SD U-Boot never ran | §6 flash glitch; try [unbricker](https://unbricker.wltechblog.com/) image |
| Blue LED + motors, **no** Wi‑Fi | Boot OK but **wrong Wi‑Fi driver** / variant | Open case; re-ID chip; wrong installer for PCB |
| Motors **never** rotate | Brick or no boot | [Unbrick video](https://www.youtube.com/watch?v=xQa9lV9r4_g); CH341A restore |
| Glitch does nothing | Wrong pins / held too long | Short **flash IC** pins 5–6 only; ~1 s at power-on |
| UART garbled | TX/RX swap / wrong baud | 115200 8N1; swap TX↔RX |
| Thingino AP but no RTSP | Not enabled in UI | Web UI → RTSP on; set credentials |
| go2rtc rear black | Wrong path / auth | VLC first; `ch1` vs `ch0`; TCP in yaml |
| Overheating / Wi‑Fi drop | Known G7 reports under load | Bench OK; monitor ([HA thread](https://community.home-assistant.io/t/new-contender-for-cheapest-off-the-shelf-rtsp-camera-galayou-g7/695120)) |
| Boot loop | Wrong `.bin` (G2 vs G7) | CH341A restore; correct G7 image |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial Phase 1c G7 checklist — active bench path; G2 deferred |
| 2026-09-11 | §0 — SD installer = boot-from-SD `sd.img`; disassembly + flash glitch documented |
| 2026-09-11 | **Paused (V1-D9)** — app + Thingino failed; not blocking Phase 3+ |
