#pragma once

class ButtonInput {
public:
    void begin();
    void poll();

private:
    bool lastPressed_ = false;
    unsigned long lastLogMs_ = 0;
};
