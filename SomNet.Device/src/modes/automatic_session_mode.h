#pragma once

#include "modes/i_execution_mode.h"

class AutomaticSessionMode : public IExecutionMode {
public:
    void start(const char* payloadJson) override;
    void poll() override;
    void abort() override;
    bool isActive() const override;

private:
    bool active_ = false;
};
