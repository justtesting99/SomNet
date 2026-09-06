#pragma once

// ESP32 DevKit V1 clone — update here if wiring changes (see Documents/09-ESP32-Device-Plan.md §1.3)

constexpr int PIN_RELAY = 4;   // D4
constexpr int PIN_BUTTON = 33; // D33
/** DevKit V1 built-in LED (GPIO 2). Debug / hub connection indicator only. */
constexpr int PIN_STATUS_LED = 2;

// Many opto relay modules are active-LOW — verify against module LED behavior in Phase 6
constexpr bool RELAY_ACTIVE_HIGH = true;
/** Most ESP32 DevKit V1 boards: built-in LED is active-LOW (LOW = lit). */
constexpr bool STATUS_LED_ACTIVE_HIGH = true;
