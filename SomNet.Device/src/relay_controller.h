#pragma once

#include <stdint.h>

typedef void (*PulseCompleteCallback)(void* context, unsigned long actualMs);

class RelayController {
public:
    void begin();
    void poll();
    bool requestPulse(unsigned long strokeMs, void* context, PulseCompleteCallback onComplete);
    unsigned long abort();
    bool isActive() const;

private:
    enum class State { Idle, On };

    void relayWrite(bool energized);

    State state_ = State::Idle;
    uint32_t onSinceUs_ = 0;
    uint32_t durationUs_ = 0;
    void* callbackContext_ = nullptr;
    PulseCompleteCallback onComplete_ = nullptr;
    bool initialized_ = false;
};
