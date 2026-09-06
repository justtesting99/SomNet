#include "command_handler.h"

#include "device_identity.h"
#include "execution_context.h"
#include "nvs_store.h"
#include "signalr_client.h"

#include <Arduino.h>
#include <string.h>

namespace {

CommandHandler* gCommandHandlerInstance = nullptr;

bool secureStringEqual(const char* a, const char* b) {
    if (a == nullptr || b == nullptr) {
        return false;
    }

    const size_t lenA = strlen(a);
    const size_t lenB = strlen(b);
    unsigned char result = static_cast<unsigned char>(lenA ^ lenB);

    const size_t maxLen = lenA > lenB ? lenA : lenB;
    for (size_t i = 0; i < maxLen; ++i) {
        const unsigned char left = i < lenA ? static_cast<unsigned char>(a[i]) : 0;
        const unsigned char right = i < lenB ? static_cast<unsigned char>(b[i]) : 0;
        result |= static_cast<unsigned char>(left ^ right);
    }

    return result == 0;
}

} // namespace

void commandHandlerOnExecuteCommand(const ExecuteCommandPayload& command) {
    if (gCommandHandlerInstance != nullptr) {
        gCommandHandlerInstance->handleExecuteCommand(command);
    }
}

void CommandHandler::begin(
    ExecutionContext* executionContext,
    NvsStore* nvsStore,
    DeviceIdentity* identity,
    SignalRClient* signalRClient) {
    executionContext_ = executionContext;
    nvs_ = nvsStore;
    identity_ = identity;
    signalR_ = signalRClient;
    gCommandHandlerInstance = this;
    initialized_ = true;
    Serial.println(F("[CMD] command_handler ready (Phase 6)"));
}

void CommandHandler::poll() {
}

bool CommandHandler::validateCommand(
    const ExecuteCommandPayload& command,
    char* rejectMessage,
    size_t rejectMessageLen) {
    if (rejectMessageLen > 0) {
        rejectMessage[0] = '\0';
    }

    if (nvs_ == nullptr || identity_ == nullptr || signalR_ == nullptr) {
        strncpy(rejectMessage, "handler unavailable", rejectMessageLen - 1);
        return false;
    }

    if (!nvs_->isPaired()) {
        strncpy(rejectMessage, "device not paired", rejectMessageLen - 1);
        return false;
    }

    if (!signalR_->isHubConnected()) {
        strncpy(rejectMessage, "hub not ready (wait for handshake ok)", rejectMessageLen - 1);
        return false;
    }

    if (command.deviceId[0] == '\0' || strcmp(command.deviceId, identity_->deviceId()) != 0) {
        strncpy(rejectMessage, "deviceId mismatch", rejectMessageLen - 1);
        return false;
    }

    char storedToken[NvsStore::kMaxTokenLen];
    if (!nvs_->getAccessToken(storedToken, sizeof(storedToken)) || storedToken[0] == '\0') {
        strncpy(rejectMessage, "missing device token", rejectMessageLen - 1);
        return false;
    }

    if (!secureStringEqual(command.accessToken, storedToken)) {
        strncpy(rejectMessage, "accessToken mismatch", rejectMessageLen - 1);
        return false;
    }

    char domTarget[NvsStore::kMaxStringLen];
    char subTarget[NvsStore::kMaxStringLen];
    if (!nvs_->getDomTarget(domTarget, sizeof(domTarget)) || domTarget[0] == '\0') {
        strncpy(rejectMessage, "missing dom target", rejectMessageLen - 1);
        return false;
    }
    if (!nvs_->getSubTarget(subTarget, sizeof(subTarget)) || subTarget[0] == '\0') {
        strncpy(rejectMessage, "missing sub target", rejectMessageLen - 1);
        return false;
    }

    if (strcmp(command.domTarget, domTarget) != 0 || strcmp(command.subTarget, subTarget) != 0) {
        strncpy(rejectMessage, "dom/sub mismatch", rejectMessageLen - 1);
        return false;
    }

    return true;
}

void CommandHandler::sendAck(
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson) {
    if (resultJson != nullptr && resultJson[0] != '\0') {
        Serial.print(F("[CMD] resultJson="));
        Serial.println(resultJson);
    }

    if (signalR_ == nullptr || correlationId == nullptr || correlationId[0] == '\0') {
        Serial.println(F("[CMD] ack skipped — hub unavailable"));
        return;
    }

    Serial.print(F("[CMD] ack correlationId="));
    Serial.print(correlationId);
    Serial.print(F(" success="));
    Serial.println(success ? F("true") : F("false"));

    if (!signalR_->sendAckCommand(
            correlationId,
            success,
            message != nullptr ? message : "",
            resultJson)) {
        Serial.println(F("[CMD] failed to send AckCommand"));
    }
}

void CommandHandler::onStrokeComplete(
    void* context,
    const char* correlationId,
    bool success,
    const char* message,
    const char* resultJson) {
    if (context == nullptr) {
        return;
    }
    static_cast<CommandHandler*>(context)->sendAck(correlationId, success, message, resultJson);
}

void CommandHandler::handleExecuteCommand(const ExecuteCommandPayload& command) {
    if (!initialized_) {
        return;
    }

    Serial.print(F("[CMD] recv correlationId="));
    Serial.print(command.correlationId);
    Serial.print(F(" key="));
    Serial.println(command.commandKey);

    char rejectMessage[96];
    if (!validateCommand(command, rejectMessage, sizeof(rejectMessage))) {
        Serial.print(F("[CMD] reject: "));
        Serial.println(rejectMessage);
        sendAck(command.correlationId, false, rejectMessage, nullptr);
        return;
    }

    if (executionContext_ == nullptr) {
        sendAck(command.correlationId, false, "execution unavailable", nullptr);
        return;
    }

    if (strcmp(command.commandKey, "abort") == 0) {
        if (!executionContext_->isActive()) {
            Serial.println(F("[CMD] reject: nothing to abort"));
            sendAck(command.correlationId, false, "nothing to abort", nullptr);
            return;
        }

        executionContext_->abortActive();
        sendAck(command.correlationId, true, "command aborted", nullptr);
        return;
    }

    if (strcmp(command.commandKey, "burst") == 0) {
        if (executionContext_->isActive()) {
            Serial.println(F("[CMD] reject: device busy"));
            sendAck(command.correlationId, false, "device busy", nullptr);
            return;
        }

        if (!executionContext_->startBurst(
                command.correlationId,
                command.payloadJson,
                this,
                &CommandHandler::onStrokeComplete)) {
            sendAck(command.correlationId, false, "invalid burst payload", nullptr);
        }

        return;
    }

    if (strcmp(command.commandKey, "stroke") != 0) {
        Serial.print(F("[CMD] unsupported commandKey: "));
        Serial.println(command.commandKey);
        sendAck(command.correlationId, false, "not implemented", nullptr);
        return;
    }

    if (executionContext_->isActive()) {
        Serial.println(F("[CMD] reject: device busy"));
        sendAck(command.correlationId, false, "device busy", nullptr);
        return;
    }

    if (!executionContext_->startSinglePulse(
            command.correlationId,
            command.payloadJson,
            this,
            &CommandHandler::onStrokeComplete)) {
        sendAck(command.correlationId, false, "invalid stroke payload", nullptr);
    }
}
