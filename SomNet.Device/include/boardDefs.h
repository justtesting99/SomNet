#pragma once

// ESP32 DevKit V1 clone — update here if wiring changes (see Documents/09-ESP32-Device-Plan.md §1.3)

constexpr int PIN_RELAY = 4;   // D4
constexpr int PIN_BUTTON = 33; // D33

// Many opto relay modules are active-LOW — verify against module LED behavior in Phase 6
constexpr bool RELAY_ACTIVE_HIGH = true;
