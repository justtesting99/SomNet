#pragma once

class ConfigWebServer {
public:
    void begin();
    void poll();

private:
    bool initialized_ = false;
};
