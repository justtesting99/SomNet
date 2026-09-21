#pragma once

#include <stddef.h>

class SessionAccessoryController {
public:
    void begin();
    bool setEnabled(bool enabled);
    bool isEnabled() const { return enabled_; }

    /** Fail-safe: de-energize accessory (hub/Wi‑Fi loss). Idempotent. */
    void releaseSafety();

private:
    void writePin(bool energized);

    bool enabled_ = false;
    bool initialized_ = false;
};

void sessionAccessoryOnTransportLost();
