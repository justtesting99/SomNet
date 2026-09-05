#include "command_handler.h"

#include <Arduino.h>

void CommandHandler::begin() {
    // Phase 5: wire execution_context + mode dispatch by commandKey
    initialized_ = true;
    Serial.println(F("[CMD] command_handler stub ready (Phase 5)"));
}

void CommandHandler::poll() {
}
