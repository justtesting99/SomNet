#pragma once

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

constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
constexpr unsigned long WIFI_RETRY_BASE_MS = 5000;
constexpr unsigned long WIFI_RETRY_MAX_MS = 60000;
