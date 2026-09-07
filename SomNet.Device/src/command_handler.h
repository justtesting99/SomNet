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
    char payloadJson[768];
};

class CommandHandler {
public:
    void begin(
        ExecutionContext* executionContext,
        NvsStore* nvsStore,
        DeviceIdentity* identity,
        SignalRClient* signalRClient);
    void poll();

    void enqueueExecuteCommand(const ExecuteCommandPayload& command);

    static void onStrokeComplete(
        void* context,
        const char* correlationId,
        bool success,
        const char* message,
        const char* resultJson);

    static void onAutomaticComplete(
        void* context,
        const char* correlationId,
        bool success,
        const char* message,
        const char* resultJson);

private:
    void handleExecuteCommand(const ExecuteCommandPayload& command);
    void sendAck(const char* correlationId, bool success, const char* message, const char* resultJson);
    bool validateCommand(const ExecuteCommandPayload& command, char* rejectMessage, size_t rejectMessageLen);

    ExecutionContext* executionContext_ = nullptr;
    NvsStore* nvs_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    SignalRClient* signalR_ = nullptr;
    bool initialized_ = false;
    bool pendingCommandReady_ = false;
    ExecuteCommandPayload pendingCommand_{};
};

void commandHandlerOnExecuteCommand(const ExecuteCommandPayload& command);
