#pragma once

class IExecutionMode {
public:
    virtual ~IExecutionMode() = default;

    virtual void start(const char* payloadJson) = 0;
    virtual void poll() = 0;
    virtual void abort() = 0;
    virtual bool isActive() const = 0;
};
