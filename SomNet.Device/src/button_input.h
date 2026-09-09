#pragma once

class ButtonInput {
public:
    void begin();
    void poll();
    /** True after 10 s reset until operator releases the button (then reboot). */
    bool isAwaitingCredentialResetRelease() const { return credentialResetAwaitRelease_; }

private:
    void handleCredentialResetHold(bool pressed);

    bool lastPressed_ = false;
    unsigned long lastLogMs_ = 0;
    unsigned long pressStartedMs_ = 0;
    bool credentialResetWarned_ = false;
    bool credentialResetTriggered_ = false;
    bool credentialResetAwaitRelease_ = false;
};
