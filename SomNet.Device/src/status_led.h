#pragma once

class StatusLed {
public:
    void begin();
    /** Solid on when hubConnected; blink when not. */
    void poll(bool hubConnected);

private:
    void writeLit(bool lit);

    unsigned long lastToggleMs_ = 0;
    bool blinkPhase_ = false;
};
