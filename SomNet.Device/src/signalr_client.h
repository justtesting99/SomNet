#pragma once

class SignalRClient {
public:
    void begin();
    void poll();

private:
    bool initialized_ = false;
};
