#pragma once

class CommandHandler {
public:
    void begin();
    void poll();

private:
    bool initialized_ = false;
};
