#pragma once

class RelayController {
public:
    void begin();
    void poll();
    void requestPulse(unsigned long strokeMs);
    void abort();

private:
    bool initialized_ = false;
};
