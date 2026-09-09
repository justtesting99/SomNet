#pragma once

class StatusLed {
public:
    void begin();
    /** Solid on when hubConnected; blink when not. */
    void poll(bool hubConnected);
    /** Fast blink — credential reset done; waiting for button release. */
    void pollCredentialResetFlash();

private:
    void writeLit(bool lit);
    void pollBlink(unsigned long intervalMs);

    unsigned long lastToggleMs_ = 0;
    bool blinkPhase_ = false;
};
