#pragma once

class ButtonInput {
public:
    void begin();
    void poll();

private:
    void handleFactoryResetHold(bool pressed);

    bool lastPressed_ = false;
    unsigned long lastLogMs_ = 0;
    unsigned long pressStartedMs_ = 0;
    bool factoryResetWarned_ = false;
    bool factoryResetTriggered_ = false;
};
