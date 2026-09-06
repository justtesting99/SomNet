#pragma once

#include <stdint.h>

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.1.0-phase1"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

#ifndef SOMNET_SERVER_HOST
#define SOMNET_SERVER_HOST ""
#endif

#ifndef SOMNET_SERVER_PORT
#define SOMNET_SERVER_PORT 5031
#endif

// Defined by env:prod_cloud in platformio.ini — enables https:// negotiate + wss:// hub.
// env:dev omits this; https:// server_url logs a hint to flash prod_cloud.
// #define SOMNET_USE_WSS 1

constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
constexpr unsigned long WIFI_RETRY_BASE_MS = 5000;
constexpr unsigned long WIFI_RETRY_MAX_MS = 60000;
constexpr unsigned kWifiConnectFailuresBeforeRecovery = 5;

constexpr unsigned long HUB_RETRY_BASE_MS = 1000;
constexpr unsigned long HUB_RETRY_MAX_MS = 60000;
constexpr unsigned long HUB_NEGOTIATE_TIMEOUT_MS = 8000;
constexpr unsigned long HUB_HANDSHAKE_TIMEOUT_MS = 15000;
constexpr unsigned long HUB_CONNECT_TIMEOUT_MS = 15000;
/** WebSockets library: block its internal reconnect loop; FSM calls begin() explicitly. */
constexpr unsigned long HUB_LIBRARY_RECONNECT_DISABLED_MS = 0x7FFFFFFFUL;
/** Wi-Fi up but hub not healthy for this long → force teardown and immediate retry. */
constexpr unsigned long HUB_STALL_RECOVERY_MS = 90000;
/** After Wi-Fi connect, wait before first hub negotiate (lwIP / AsyncTCP settle). */
constexpr unsigned long HUB_BOOT_SETTLE_MS = 2500;
/** Extra settle after power-on / brownout reset before hub negotiate. */
constexpr unsigned long HUB_COLD_BOOT_SETTLE_MS = 8000;
/** Consecutive TCP/HTTP transport failures before Wi-Fi refresh. */
constexpr unsigned HUB_TRANSPORT_FAILURE_RECOVERY_COUNT = 6;
/** Consecutive transport failures before device reboot. */
constexpr unsigned HUB_TRANSPORT_FAILURE_REBOOT_COUNT = 12;
/** Defer config HTTP until hub connected; max wait before starting anyway. */
constexpr unsigned long CONFIG_HTTP_MAX_DEFER_MS = 120000;

/** Non-blocking ARP warm: poke API host MAC for this long before hub negotiate. */
constexpr unsigned long LAN_ARP_WARM_MAX_MS = 5000;
constexpr unsigned long LAN_ARP_POKE_INTERVAL_MS = 100;

/** Built-in status LED blink interval when hub is not connected. */
constexpr unsigned long STATUS_LED_BLINK_MS = 500;

constexpr unsigned long SNTP_SYNC_TIMEOUT_MS = 30000;
constexpr uint64_t TOKEN_EXPIRY_BUFFER_MS = 5ULL * 60ULL * 1000ULL;
/** Serial `[HUB] expiry diag` only when effective expiry is within this window (7 days). */
constexpr uint64_t TOKEN_EXPIRY_DIAG_WINDOW_MS = 7ULL * 24ULL * 60ULL * 60ULL * 1000ULL;
constexpr unsigned long TOKEN_EXPIRY_DIAG_INTERVAL_MS = 60000UL;

constexpr unsigned long kMaxStrokeMs = 30000;
constexpr int kMaxBurstStrokes = 100;
constexpr unsigned long kMaxBurstDelayMs = 300000UL;

constexpr unsigned long CREDENTIAL_RESET_HOLD_MS = 10000;
constexpr unsigned long CREDENTIAL_RESET_WARN_MS = 5000;

constexpr uint16_t CONFIG_HTTP_PORT = 80;
