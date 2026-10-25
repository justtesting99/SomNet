# Scheduled jobs — LAN automatic sessions (SomEsp local API)

**Status:** **Design + integration guide** — describes how a **.NET 9 host application** runs **scheduled jobs** that start **automatic mode** on an ESP32 **over the local network only**, with **no UI** and **no video**.

**Companion implementation (planned):** `SomNet.Device.LocalClient` — thin HTTP client library referenced by the host app (project reference to `SomNet.Shared` for DTOs/enums).

| Related | Link |
|---------|------|
| SomEsp operator + local API | [SomNet.Device/docs/SOMESP-STANDALONE.md](../SomNet.Device/docs/SOMESP-STANDALONE.md) |
| Payload shapes (`automatic-start` / stop `resultJson`) | [SomNet.Device/docs/PROTOCOL.md](../SomNet.Device/docs/PROTOCOL.md) §6.5–6.7, §4.2 |
| SomEsp product boundary | [27 — SomEsp standalone device plan](./27-SomEsp-Standalone-Device-Plan.md) |
| Cloud session history (optional mirror) | [07 — Session & History](./07-Session-And-History.md) |
| Site profiles (why not hub for this use case) | [26 — Site operating profiles](./26-ESP32-Local-Offline-Mode-Design.md) §0.3 |

---

## 1. Use case summary

| Requirement | Choice |
|-------------|--------|
| Network | **LAN only** — app and ESP on same Wi‑Fi; **do not** port-forward device HTTP |
| Trigger | **Scheduled jobs** (units of work) in the main application |
| Action | Connect to device → pass **automatic program parameters** → **start** session |
| Video | **Out of scope** — no go2rtc, Edge.Agent, or session video tokens |
| UI | **None** — no live status dashboard required |
| Outcome for scheduler | **Structured completion result** (success/failure, human-readable message, machine-readable summary) returned to the job host |
| History | **Primary:** job host persists its own run log; **nice-to-have:** device LittleFS history and/or SomNet.API session rows if a LAN API is deployed later |

---

## 2. Recommended architecture

```text
┌─────────────────────────────┐
│  Main application (.NET 9)  │
│  Job scheduler              │
│    └─ AutomaticDeviceJob    │
│         └─ SomNet.Device.   │
│            LocalClient      │
└──────────────┬──────────────┘
               │ HTTP (LAN)
               ▼
┌─────────────────────────────┐
│  ESP32 — env:somesp         │
│  POST /api/local/*          │
│  (hub paused — see §5)      │
└─────────────────────────────┘
```

**Do not** route scheduled work through **SomNet.UI**. **Do not** require **SomNet.API** for the core path.

**Firmware:** PlatformIO **`env:somesp`** (`SOMNET_STANDALONE=1`). Standard **`env:dev`** hub firmware does **not** expose `/api/local/commands`.

**Configuration (per device or job):**

| Setting | Example | Notes |
|---------|---------|--------|
| `BaseUrl` | `http://192.168.1.42` | Stable IP, DHCP reservation, or mDNS if you add it |
| `Pin` | stored in secret config | Default factory PIN `1234` — change on device |
| `HubPaused` | `true` (recommended) | Avoid concurrent control from SomNet hub — §5 |

---

## 3. Device protocol (job workflow)

### 3.1 Preconditions

1. Device finished Wi‑Fi provisioning (not on setup Soft‑AP).
2. `GET {BaseUrl}/api/status` — `wifiConnected: true`, sensible `ip`.
3. Job checks **no conflicting run**: `GET /api/local/status` — reject or queue if `busy` or `automaticActive` (policy in §6).

### 3.2 Control sequence

| Step | Method | Path | Auth | Body |
|------|--------|------|------|------|
| 1 | POST | `/api/local/unlock` | — | `{"pin":"<pin>"}` |
| 2 | POST | `/api/local/arm` | `Bearer <token>` | — |
| 3 | POST | `/api/local/commands` | Bearer + armed | `{"commandKey":"automatic-start","payloadJson":{...}}` |
| 4 | Poll | `/api/local/status` | — | until session finished or timeout |
| 5 (optional) | POST | `/api/local/disarm` | Bearer | after run if GPIO should release until next job |
| 6 (optional) | POST | `/api/local/lock` | Bearer | clear token on shared machines |

**Unlock response:** `token`, `expiresAtMs` (firmware TTL **8 hours** — see `kLocalOperateTokenTtlMs` in `SomNet.Device/include/config.h`).

**Commands response:** `{"accepted":true,"correlationId":"local-..."}` — **asynchronous**; completion is **not** on this HTTP response.

**Local gating:** **`arm`** enables the session accessory (same safety role as cloud “Session in Progress” + `session-accessory` on hub firmware). **`automatic-start` is rejected** if not armed.

### 3.3 Automatic-start payload

Same snapshot as SomNet UI / hub (`PROTOCOL.md` §6.5):

- camelCase JSON
- **Required:** `automaticMode` — one of: `periodic`, `randomPowerOnly`, `randomTimingOnly`, `randomPowerAndTiming`, `powerWave`, `powerAndTimingWave`, `buildUp`
- **Omit:** `running` (UI-only)
- **End conditions:** `endSessionMode`, `endSessionValue` — prefer setting these in the payload so the **device ends the program** and the job only waits (§4)

Build in C# with **`AutomaticControlStateDto`** (`SomNet.Shared`) serialized with **camelCase** and **without** `Running`.

`payloadJson` in the POST body may be a **JSON object** or a string; the device accepts both.

### 3.4 Stop and abort (optional job branches)

| commandKey | payloadJson | When |
|------------|-------------|------|
| `automatic-stop` | `{}` | Cancel cooperative stop |
| `abort` | `{}` | Hard abort active execution |

Both require Bearer + armed (same as `/operate`).

---

## 4. Completion result for the scheduler

The job should return a **single result object** to the host (interface below). The host uses it for retries, next-run time, and alerting — **not** for a SomNet UI.

### 4.1 Polling strategy

After `automatic-start` is **accepted**:

1. Poll `GET /api/local/status` every **500–1000 ms** (operate UI uses ~800 ms).
2. Continue while `automaticActive || busy` **or** until **job max duration** elapses.
3. When `automaticActive` becomes **false** and `busy` is **false**, treat the run as **finished** (subject to timeout rules).

**Do not** treat the **first** `commandComplete` after start as session end — start ack completes quickly while `automaticActive` stays true.

### 4.2 Fields on `/api/local/status`

| Field | Use in jobs |
|-------|-------------|
| `automaticActive` | Session still running |
| `busy` | Stroke/burst/automatic engine active |
| `commandComplete` / `commandSuccess` / `commandMessage` | Last command ack (start fail, stop ack, etc.) |
| `resultJson` | **Authoritative session summary** when automatic ends (same shape as hub `automatic-stop` / `automatic-session-complete`) |
| `lastCorrelationId` | Correlate with `local-…` from commands POST |
| `armed` / `unlocked` | Recovery if Wi‑Fi drop cleared session |

On natural end or stop, `resultJson` typically contains `commandKey: "automatic-stop"`, `strokesCompleted`, `durationMs`, `endReason`, `interrupted`, etc. — see **PROTOCOL.md** §4.2.

Parse `resultJson` into a small DTO in the client library (mirror `SomNet.UI` `automaticResultJson` semantics).

### 4.3 Suggested `AutomaticDeviceJobResult` (host contract)

```csharp
// Illustrative — implement in SomNet.Device.LocalClient
public sealed record AutomaticDeviceJobResult
{
    public required AutomaticDeviceJobStatus Status { get; init; }
    public required string Message { get; init; }           // scheduler-friendly line
    public string? DeviceCorrelationId { get; init; }
    public AutomaticSessionSummary? Summary { get; init; } // from resultJson
    public TimeSpan? ObservedDuration { get; init; }
    public Exception? Fault { get; init; }                  // transport/errors only
}

public enum AutomaticDeviceJobStatus
{
    Completed,           // automatic finished; Summary populated when possible
    FailedPrecondition,  // busy, already active, not armed, unlock failed
    FailedStart,         // start rejected (commandSuccess false on start ack)
    TimedOut,            // max wait exceeded (device may still be running — log + alert)
    Cancelled,           // host cancellation token
    DeviceUnreachable    // HTTP / Wi‑Fi / setup_mode
}
```

**Message examples:**

| Status | Example `Message` |
|--------|-------------------|
| `Completed` | `Automatic ended: endSession, 42 strokes, 18.2 min` |
| `FailedStart` | `automatic-start rejected: session accessory off` |
| `FailedPrecondition` | `Device busy; job skipped` |
| `TimedOut` | `Poll timeout after 90 min; automaticActive still true` |

Map `endReason` from `resultJson`: `manualStop`, `endSession`, `abort`, `error`.

### 4.4 Job-owned audit log (recommended)

Persist per run in the **main application database** (not on ESP):

- Job id, schedule id, `BaseUrl`, start/end UTC
- `AutomaticDeviceJobStatus`, `Message`
- Raw `resultJson` (optional)
- Parameters snapshot (or preset id)

This is the **source of truth** for scheduling analytics.

---

## 5. Hub coexistence (hybrid SomEsp)

SomEsp may have `server_url` and pairing configured. For **scheduler-only** operation:

- Set **`hubEnabled: false`** (`POST /api/hub/mode` `{"enabled":false}` or device status page) so SomNet.API does not compete for the same execution context.
- Pairing can remain in NVS for occasional manual use from SomNet.UI.

If hub stays **enabled**, treat **hub commands and local jobs as mutually exclusive** — only one controller per session.

---

## 6. Scheduler policies

| Policy | Recommendation |
|--------|----------------|
| **Concurrency** | At most **one** automatic session per device IP; use a distributed lock in the app if multiple workers exist |
| **Overlap** | If `automaticActive` at job fire: **skip** (log `FailedPrecondition`), **fail**, or **`automatic-stop`** then restart — choose explicitly per job type |
| **Duration bound** | Set `endSessionMode` / `endSessionValue` on device **and** a **host poll timeout** ≥ expected run + margin |
| **Delay** | `delayBeforeStartSeconds` in payload — job “start” returns quickly; polling accounts for delay |
| **Secrets** | PIN in user secrets / vault; never commit |
| **Wi‑Fi loss** | Device locks + disarms; next job must unlock + arm again |

---

## 7. History — nice-to-have options

### 7.1 Device local history (SomEsp, no SomNet.API)

After a successful run, optionally:

- `GET /api/local/history` (Bearer) — list recent items
- `GET /api/local/history?id={id}` — full event JSON

Stored on **LittleFS** (capped, ~30 events). Good for **field debugging**; not a substitute for app-level job history.

### 7.2 SomNet.API session history (optional LAN mirror)

If you later run **SomNet.API on the LAN** (tier 2 / Pi profile in doc 26) **and** enable the hub on the device:

| Benefit | Cost |
|---------|------|
| Rich **session timeline** in SomNet DB ([07](./07-Session-And-History.md)) | JWT, `subTarget`, pairing, hub online |
| Same summaries as operator UI | Video hooks fire on session APIs — disable or ignore video config |
| `POST /api/devices/commands` instead of local API | Not LAN-only-simple; couples jobs to API uptime |

**Practical hybrid for “nice history” without video:**

1. Keep **scheduled execution** on **local API** (this doc).
2. After job `Completed`, append a row to **your app DB** (§4.4).
3. **Optional:** push a one-line summary into SomNet via a future small import API or manual copy — **not implemented today**.

Until an import exists, **device history GET** + **app job log** deliver most of the value without SomNet.API.

---

## 8. Implementation plan (LocalClient + LocalGateway)

Phased build, HTTP contract, Docker, and checklists:

**[29 — Device local gateway — implementation plan & checklists](./29-Device-Local-Gateway-Implementation-Plan.md)**

Summary:

| Project | Role |
|---------|------|
| `SomNet.Device.LocalClient` | ESP `/api/local/*` client + `AutomaticDeviceJobRunner` |
| `SomNet.Device.LocalGateway` | Lightweight HTTP API (**port 5290**) for the main application |
| `SomNet.Shared` | DTOs + `AutomaticSessionSummaryBuilder` (SomNet-style history line) |

**Non-goals:** SignalR, JWT, full SomNet.API, UI, video.

---

## 9. Raw result vs displayed history

The ESP produces authoritative **`resultJson`** when an automatic session ends. SomNet UI/API **transform** that into a single **`summary`** string for the history timeline ([07 — Session & History](./07-Session-And-History.md)); the SQL session row does not retain full JSON. The main application should **store raw `result` + computed `summary`** (gateway returns both per [doc 29](./29-Device-Local-Gateway-Implementation-Plan.md)).

---

## 10. Security reminders

- **LAN trust boundary** — any host on Wi‑Fi can attempt unlock; use a strong PIN and isolated SSID if needed.
- **No TLS** on device HTTP today — acceptable only on trusted LAN.
- **Disarm** when idle if physical safety policy requires GPIO off between scheduled runs.

---

## 11. Smoke test (manual)

1. Flash **somesp**, note IP, pause hub.
2. From PowerShell or `curl`: unlock → arm → `automatic-start` with short `endSessionMode: strokes` and low `endSessionValue`.
3. Poll `/api/local/status` until `automaticActive` is false; confirm `resultJson` present.
4. Wire the same sequence through `AutomaticDeviceJobRunner` once the library exists.

---

## Document history

| Date | Change |
|------|--------|
| 2026-10-25 | Initial guide — LAN scheduled jobs, completion contract, history options |
| 2026-10-25 | Link doc 29; §9 raw result vs summary |
