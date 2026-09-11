# Phase 1b — Galayou G2 rear camera (Layout A)

**Goal:** Add the **Galayou G2** as the **rear** IP stream in go2rtc; SomNet UI rear panel uses `src=rear`.

**Status:** **Deferred** — bench uses [G7 setup](./14-Video-Phase-1b-Galayou-G7-Setup.md) + [G7 Thingino flash](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md). Keep this doc for **G2 pan/tilt** fleet later.

**Stock Wansview app:** **Dead on bench** (iPhone cannot confirm LED / provision — G2 and G7). **Thingino:** paused (V1-D9).

**Preferred firmware:** **[Thingino](https://thingino.com/cameras/20)** on G2 — local web UI + RTSP/ONVIF, **no Wansview cloud tunnel**. See [§ Alternative firmware — Thingino](#alternative-firmware--thingino-preferred) and **Phase 1c** for the flash procedure.

| Related | Link |
|---------|------|
| Phase 1 checklist | [14-Video-Phase-1-Edge-Bench-Checklist.md](./14-Video-Phase-1-Edge-Bench-Checklist.md) |
| Phase 2 (UI) | [15-Video-Phase-2-UI-Embed-Checklist.md](./15-Video-Phase-2-UI-Embed-Checklist.md) |
| Edge scripts | [SomNet.Edge/README.md](../SomNet.Edge/README.md) |

---

## 1. Camera prep

### Path A — Thingino *(preferred for production)*

Flash **Thingino** for Galayou G2, then configure Wi‑Fi and RTSP via the **local web UI** — no Wansview app. Full steps: [§ Alternative firmware — Thingino](#alternative-firmware--thingino-preferred).

### Path B — Stock Wansview *(abandoned — reference only)*

> **2026-09-11:** Wansview Cloud pairing failed on G2 (app broken for this model). Use **Path A (Thingino)** via [Phase 1c checklist](./14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md).

The stock G2 has **no web UI** — one-time setup via **Wansview Cloud** (iOS/Android), then **block camera WAN** at router.

1. Power the camera; complete Wi‑Fi setup in the app.
2. **Settings → Local application → Local account** — set a **username and password** (remember these).
3. **Settings → Local application → RTSP** — turn **RTSP on**; note the **port** (default **554**, range 554–1554).
4. Copy the **RTSP URL** from the app, or build it:

| Stream | Path | Use for SomNet live |
|--------|------|---------------------|
| Main | `/live/ch0` | Higher quality; more CPU/bandwidth |
| Sub | `/live/ch1` | **Preferred** for dashboard live (1080p-class) |

Example:

```text
rtsp://YOUR_USER:YOUR_PASS@192.168.1.50:554/live/ch1
```

5. Optional: enable **ONVIF** (same Local application menu) for discovery tools.

**Special characters in password:** URL-encode `@`, `:`, `#`, etc. in the RTSP URL.

### Security — vendor cloud tunnel (important)

The Wansview Cloud app can keep an **outbound tunnel** from the camera to **vendor servers** (for remote app viewing). That is **separate from RTSP** and can export video outside your LAN.

**SomNet policy (same idea as Blue Iris LAN-only):**

1. Use the app **once** for Wi‑Fi, local account, and RTSP enable.
2. **Block camera outbound internet** at the router (allow LAN only — e.g. RTSP to your PC/Pi edge).
3. SomNet video path = **LAN RTSP → go2rtc on edge → your tunnel** (Phase 6) — never through Wansview cloud.

Verify with Wireshark or router logs after blocking: RTSP from edge to `192.168.x.x:554` should work; vendor URLs should not.

See [13 — Vendor camera cloud tunnels](./13-Video-And-Camera-Architecture.md#vendor-camera-cloud-tunnels-galayou--wansview-and-similar).

---

## 1b. Why stock pairing fails (especially with router WAN block)

This is **by design**, not misconfiguration. Modern Galayou/Wansview firmware is **cloud-first**:

| Step | What happens |
|------|----------------|
| App “Add device” | Phone ↔ **vendor servers** (account, device registration) |
| Camera after Wi‑Fi | Camera ↔ **vendor P2P/cloud** to show **online** in app |
| Local Application menu | Only when app reports camera **online** via cloud relay |

The manual even requires the **router to have internet**. Blocking **camera outbound** during pairing prevents registration → pairing fails or stays offline forever. Your Wireshark finding and router policy are correct; **stock firmware is the wrong tool** if you refuse vendor cloud access.

**Options:**

1. **Thingino (preferred)** — flash without Wansview app; local web UI + RTSP ([§ Alternative firmware](#alternative-firmware--thingino-preferred)). G2 has a dedicated image but **no easy SD “no-tool” installer** (unlike G7/Y4) — expect UART, USB Cloner, or CH341A.
2. **Stock interim only** — **temporarily allow** one camera’s WAN during pairing → enable RTSP → verify LAN RTSP → **block again**. Not for production.

---

## 1c. App says light “not flashing” (but it is)

The G2 uses **different LED patterns** than Q5/Q6/K5. If you pick the wrong model or tap the wrong prompt, the app rejects a **valid** G2 light.

**G2 indicator (from manual):**

| Blue light | Meaning |
|------------|---------|
| Solid on | Powered |
| **Double-flash intermittently** | **Ready to pair** (waiting for connect) |
| Fast flash | Connecting Wi‑Fi *or* factory reset in progress |
| Slow flash | Registering on vendor server |
| Solid blue | Paired / online |

**Not** red+blue — that is **Y4 outdoor** and some other Wansview models.

**Checklist:**

1. Add device → choose **Galayou → G2** (not Q5/Q6/K5).
2. After reset: hold **~5 s** until voice “reset successful” → wait **~1 min** → look for **double-flash blue**, not slow single blink.
3. On **“Check the indicator light”** — tap **Flashing** (confirms double-flash). **Do not tap Next first**; Next stays disabled until Flashing is acknowledged.
4. **Soft-AP (G2):** **Didn’t hear it?** → Soft-AP → **scan QR on camera sticker** (in-app) → **Flashing** → iPhone joins `WVC*****` (**Use Without Internet**) → return to app → home 2.4 GHz Wi‑Fi. No browser page on the hotspot.
5. **QR path (default G2):** max phone brightness; hold QR **3–8 in** from lens until camera **beeps** (“scan successful”) → then Next.
6. Camera **within ~3 ft** of router; phone on **2.4 GHz** Wi‑Fi; disable VPN; allow **Local Network** + **Location** (iPhone); microphone if app asks (tone path).
7. **Delete** stale offline G2 entries before adding fresh after factory reset.

If Soft-AP also fails with WAN block on, temporarily allow camera outbound again — “registering on server” (slow blue) needs vendor reachability.

---

## 1d. Troubleshooting — all cameras “offline” in app

The app lists devices from your **cloud account**; **Local application** settings only appear when a camera shows **online** (app talks to camera via vendor cloud relay, not pure LAN).

Common after long storage or with **router WAN block** on cameras:

| Cause | What to do |
|-------|------------|
| Camera not powered / wrong outlet | Plug in one G2 near router; wait for slow blue flash |
| Stale Wi‑Fi (new router/password) | Factory reset camera → **Add device** again in app |
| **Router blocks camera outbound** | **Temporarily allow** that camera’s internet during setup only |
| App cache | Force-quit Wansview → reopen; or delete offline device → re-add |
| Phone on wrong network | Phone on **same 2.4 GHz Wi‑Fi** as camera during add |

**Setup sequence (one camera for SomNet bench):**

1. **Pause** router block for **one** camera (by MAC/IP) — or disable block rule until step 8.
2. **Factory reset** that G2: hold reset **~5 s** until “reset successful” / fast blue flash → wait ~1 min.
3. In app: **Add device** (QR / Wi‑Fi pairing) — not just opening old offline entries.
4. Wait until status is **online** (live preview works in app).
5. **Settings → Local application** → local account + **RTSP on**.
6. Note IP; run `test-rtsp.ps1` from PC.
7. **Re-enable router block** for camera; test RTSP again.
8. Add `rear` to `go2rtc.yaml`.

Old offline entries can stay in the app list — focus on **one** freshly paired camera for Phase 1b.

---

## 2. Find camera IP (if unknown)

```powershell
cd D:\MoreRepos\SomNet
.\SomNet.Edge\scripts\find-lan-rtsp.ps1
```

Confirm the IP matches **Wansview Cloud → device settings → network**.

---

## 3. Test RTSP (before go2rtc)

```powershell
.\SomNet.Edge\scripts\test-rtsp.ps1 -Url 'rtsp://USER:PASS@192.168.1.50:554/live/ch1'
```

Or VLC: **Media → Open Network Stream** → paste the same URL.

Try `/live/ch1` first; if blank or errors, try `/live/ch0`.

---

## 4. go2rtc — add `rear` stream

Edit **`D:\SomNet.Edge\go2rtc.yaml`** (never commit credentials):

```yaml
streams:
  front:
    - 'exec:ffmpeg -hide_banner -f dshow -i "video=HD User Facing" -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g 25 -an -f mpegts -'

  rear:
    - rtsp://USER:PASS@192.168.1.50:554/live/ch1#rtsp_transport=tcp
```

Restart go2rtc:

```powershell
.\SomNet.Edge\scripts\stop-go2rtc-windows.ps1
.\SomNet.Edge\scripts\start-go2rtc-windows.ps1
```

**Browser checks:**

- http://localhost:1984/stream.html?src=rear&mode=mse
- http://localhost:5031/go2rtc/stream.html?src=rear&mode=mse

Front and rear should show **different** pictures.

---

## 5. SomNet UI — rear panel → `src=rear`

In **`SomNet.UI/.env.production`** (and `.env.development` if using `npm run dev`):

```env
VITE_VIDEO_REAR_URL=/go2rtc/stream.html?src=rear
```

Rebuild and restart API:

```powershell
cd D:\MoreRepos\SomNet\SomNet.UI
npm run build
# Visual Studio F5 — or dotnet run
```

Hard-refresh the dashboard (**Ctrl+F5**). Front = webcam, Rear = G2.

---

## 6. Phase 1b sign-off (V1-T3–T6)

| # | Check |
|---|--------|
| V1-T3 | Front + rear play **simultaneously** (two tabs or SomNet UI) ≥ 2 min |
| V1-T4 | Delay ~3–10 s acceptable |
| V1-T5 | Rear shows **real IP camera** (not webcam mirror) |
| V1-T6 | Record layout **A**, camera model, RTSP path in Phase 1 checklist §8 |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `test-rtsp.ps1` fails | RTSP off in app; wrong user/pass; camera on guest Wi‑Fi; try `tcp` (already in go2rtc example) |
| go2rtc rear error | Wrong path — try `ch0` vs `ch1`; URL-encode password |
| UI rear still webcam | Rebuild UI after env change; confirm `src=rear` in iframe URL (DevTools) |
| Worked once, then dead | Camera asleep — wake in app; check same LAN as PC (`192.168.1.x`) |

---

## Alternative firmware — Thingino *(preferred)*

**SomNet direction:** Replace stock Wansview firmware on **Galayou G2** with **[Thingino](https://thingino.com/cameras/20)** for tool-site cameras. Eliminates vendor cloud tunnels to third-party URLs; aligns with LAN-only RTSP → Pi edge → session-scoped operator access (same model as prior Blue Iris use).

| Item | Detail |
|------|--------|
| **Model** | Galayou G2 — SoC **T23N**, SC2336, ATBM6012BX (confirm board before flash) |
| **Firmware** | `thingino-galayou_g2_t23n_sc2336_atbm6012bx.bin` — [releases](https://github.com/themactep/thingino-firmware/releases) |
| **After flash** | Local web UI; **RTSP/ONVIF**; no Wansview app for operation |
| **SomNet integration** | Unchanged — LAN RTSP URL in `go2rtc.yaml` on edge |

**Install:** See **[Phase 1c — Thingino G2 flash checklist](./14-Video-Phase-1c-Thingino-G2-Flash-Checklist.md)** (UART primary; CH341A backup/recovery; SD `autoupdate-full.bin` after Thingino bootloader exists). USB Cloner **not supported** on G2. **Back up stock firmware**; brick risk on wrong image.

**Helpful video:** [YouTube — G2 Thingino flash walkthrough](https://www.youtube.com/watch?v=F3YRIqseVTk&t=219s) *(starts ~3:39)*

**Not OpenIPC for G2:** use the **G2-specific Thingino build**, not generic OpenIPC T31 images (OpenIPC targets other Wansview models).

**Router egress block:** still recommended defense-in-depth even on Thingino.

**Phase 1b bench:** stock + router block remains valid if Thingino flash is deferred; production Pi sites should plan **Thingino before go-live**.

---

## Future (not Phase 1b)

Manual yaml/env steps above are bench-only. Production intent: **site installer** enters camera/edge settings on **ESP32 `/config`** (or edge local UI) → values sync to **API/database** → remote operators see feeds in SomNet web without editing yaml/env. See [14-Video-Implementation-Plan.md — Future enhancements](./14-Video-Implementation-Plan.md#future-enhancements-todo).

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial Galayou G2 bench guide |
| 2026-09-11 | **Thingino preferred** for G2 moving forward; stock Wansview interim bench only |
| 2026-09-11 | §1b — stock pairing requires vendor cloud; fails with router WAN block |
| 2026-09-11 | Blocked on Phase 1c; stock Wansview abandoned; link to Thingino flash checklist |
| 2026-09-11 | **Deferred** — bench pivoted to G7; see G7 setup + 1c G7 checklists |
