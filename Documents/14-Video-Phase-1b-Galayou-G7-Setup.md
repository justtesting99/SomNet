# Phase 1b — Galayou G7 rear camera (Layout A)

**Goal:** Add the **Galayou G7** as the **rear** IP stream in go2rtc; SomNet UI rear panel uses `src=rear`.

**Status:** **On hold** (V1-D9) — not on critical path. Active dev uses **Layout A-dev** (2× USB webcam). Resume after [Phase 1c G7 flash](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) or another IP path works.

| Related | Link |
|---------|------|
| Phase 1c (flash) | [14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) |
| Phase 1 bench | [14-Video-Phase-1-Edge-Bench-Checklist.md](./14-Video-Phase-1-Edge-Bench-Checklist.md) |
| G2 guide *(deferred)* | [14-Video-Phase-1b-Galayou-G2-Setup.md](./14-Video-Phase-1b-Galayou-G2-Setup.md) |
| Phase 2 (UI) | [15-Video-Phase-2-UI-Embed-Checklist.md](./15-Video-Phase-2-UI-Embed-Checklist.md) |

**Bench path:** Flash G7 with **Thingino** ([SD installer](https://github.com/wltechblog/thingino-installers/tree/main/galayou-g7)) — no Wansview app. Stock app **abandoned** (iPhone pairing failed).

**Production:** Thingino on all site IP cameras where possible; router WAN block after RTSP verified.

---

## 1. Camera prep (Thingino)

Complete [Phase 1c](./14-Video-Phase-1c-Thingino-G7-Flash-Checklist.md) through post-flash Wi‑Fi + RTSP enable.

| Stream | Path | Use for SomNet live |
|--------|------|---------------------|
| Main | `/live/ch0` | Higher quality |
| Sub | `/live/ch1` | **Preferred** for dashboard live |

Example:

```text
rtsp://YOUR_USER:YOUR_PASS@192.168.1.50:554/live/ch1
```

**Special characters in password:** URL-encode `@`, `:`, `#`, etc.

---

## 2. Find camera IP (if unknown)

```powershell
cd D:\MoreRepos\SomNet
.\SomNet.Edge\scripts\find-lan-rtsp.ps1
```

Confirm IP in Thingino web UI or router DHCP table.

---

## 3. Test RTSP (before go2rtc)

```powershell
.\SomNet.Edge\scripts\test-rtsp.ps1 -Url 'rtsp://USER:PASS@192.168.1.50:554/live/ch1'
```

Or VLC: **Media → Open Network Stream**. Try `/live/ch1` first, then `/live/ch0`.

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

Hard-refresh the dashboard (**Ctrl+F5**). Front = webcam, Rear = G7.

---

## 6. Phase 1b sign-off (V1-T3–T6)

| # | Check |
|---|--------|
| V1-T3 | Front + rear play **simultaneously** ≥ 2 min |
| V1-T4 | Delay ~3–10 s acceptable |
| V1-T5 | Rear shows **real IP camera** (not webcam mirror) |
| V1-T6 | Record layout **A**, camera model **Galayou G7**, RTSP path in Phase 1 checklist §8 |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `test-rtsp.ps1` fails | RTSP off in Thingino UI; wrong creds; try `tcp` (in go2rtc example) |
| go2rtc rear error | Try `ch0` vs `ch1`; URL-encode password |
| UI rear still webcam | Rebuild UI; confirm `src=rear` in iframe URL (DevTools) |
| RTSP dies after router block | Allow LAN subnet; block WAN only |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-11 | Initial G7 bench guide — active rear camera for Layout A |
| 2026-09-11 | **Deferred (V1-D9)** — app + Thingino failed; not blocking dev |
