#pragma once

#include <stddef.h>

#include "config.h"

class DeviceIdentity;
class ExecutionContext;
class NvsStore;
class SignalRClient;
class SessionAccessoryController;
class MotorController;
class MotorAutomaticSessionMode;

struct ExecuteCommandPayload {
    char correlationId[64];
    char commandKey[32];
    char accessToken[512];
    char domTarget[64];
    char subTarget[64];
    char deviceId[32];
    char payloadJson[kMaxHardwareCommandPayloadJson];
    bool fromLocal = false;
};

class CommandHandler {
public:
    void begin(
        ExecutionContext* executionContext,
        NvsStore* nvsStore,
        DeviceIdentity* identity,
        SignalRClient* signalRClient,
        SessionAccessoryController* sessionAccessory,
        MotorController* motorController);
    void poll();

    void enqueueExecuteCommand(const ExecuteCommandPayload& command);

    /** True when relay or motor motion/automatic work is in flight (local status M2-F1). */
    bool isMotionBusy() const;

    /** True when relay or motor automatic session is active (local status M2-F1). */
    bool isAutomaticProgramActive() const;

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

    static void onMotorAutomaticSegment(void* context, const char* resultJson);

    static void onRelayAutomaticSegment(void* context, const char* resultJson);

private:
    void handleExecuteCommand(const ExecuteCommandPayload& command);
    void pollMotorManualRun();
    void completeMotorManualRun(bool success, const char* message, bool interrupted);
    void sendAck(const char* correlationId, bool success, const char* message, const char* resultJson);
    bool validateHubCommand(const ExecuteCommandPayload& command, char* rejectMessage, size_t rejectMessageLen);
    bool validateLocalCommand(const ExecuteCommandPayload& command, char* rejectMessage, size_t rejectMessageLen);

    ExecutionContext* executionContext_ = nullptr;
    NvsStore* nvs_ = nullptr;
    DeviceIdentity* identity_ = nullptr;
    SignalRClient* signalR_ = nullptr;
    SessionAccessoryController* sessionAccessory_ = nullptr;
    MotorController* motor_ = nullptr;
    MotorAutomaticSessionMode* motorAutomatic_ = nullptr;
    bool initialized_ = false;
    bool pendingCommandReady_ = false;
    ExecuteCommandPayload pendingCommand_{};
    bool motorManualRunActive_ = false;
    char motorManualCorrelationId_[64] = {};
    unsigned long motorManualRunStartMs_ = 0;
    unsigned long motorManualRunUntilMs_ = 0;
    int motorManualDuty_ = 0;
    unsigned long motorManualDurationMs_ = 0;
};

void commandHandlerOnExecuteCommand(const ExecuteCommandPayload& command);

#if SOMNET_LOCAL_OPERATE_ENABLED
class LocalOperate;
void commandHandlerSetLocalOperate(LocalOperate* localOperate);
#endif
