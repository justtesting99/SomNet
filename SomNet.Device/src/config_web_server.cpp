#include "config_web_server.h"

void ConfigWebServer::begin() {
    // Phase 3: ESPAsyncWebServer on LAN
    initialized_ = true;
}

void ConfigWebServer::poll() {
}
