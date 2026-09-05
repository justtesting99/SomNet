#pragma once

class ButtonInput {
public:
    void begin();
    void poll();

private:
    void handleCredentialResetHold(bool pressed);

    bool lastPressed_ = false;
    unsigned long lastLogMs_ = 0;
    unsigned long pressStartedMs_ = 0;
    bool credentialResetWarned_ = false;
    bool credentialResetTriggered_ = false;
};
