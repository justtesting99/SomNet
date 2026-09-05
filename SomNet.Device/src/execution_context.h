#pragma once

class IExecutionMode;

class ExecutionContext {
public:
    void begin();
    void poll();
    void abortActive();
    bool isActive() const;

private:
    IExecutionMode* activeMode_ = nullptr;
};
