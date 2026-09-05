#pragma once

#include <stddef.h>

class DeviceIdentity;
class ExecutionContext;
class NvsStore;
class SignalRClient;

struct ExecuteCommandPayload {
    char correlationId[64];
    char commandKey[32];
    char accessToken[512];
    char domTarget[64];
    char subTarget[64];
    char deviceId[32];
    char payloadJson[256];
};

class CommandHandler {
public:
    void begin(
        ExecutionContext* executionContext,
        NvsStore* nvsStore,
        DeviceIdentity* identity,
        SignalRClient* signalRClient);
    void poll();

    void handleExecuteCommand(const ExecuteCommandPayload& command);

    static void onStrokeComplete(
        void* context,
        const char* correlationId,
        bool success,
        const char* message,
        const char* resultJson);

private:
    void sendAck(const char* correlationId, bool success, const char* message, const char* resultJson);
    bool validateCommand(const ExecuteCommandPayload& command, char* rejectMessage, size_t rejectMessageLen);

    ExecutionContext* executionContext_ = nullptr;
    NvsStore* nvs_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    SignalRClient* signalR_ = nullptr;
    bool initialized_ = false;
};

void commandHandlerOnExecuteCommand(const ExecuteCommandPayload& command);
