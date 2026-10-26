#pragma once

// ESP32 DevKit V1 clone — update here if wiring changes (see Documents/09-ESP32-Device-Plan.md §1.3)

constexpr int PIN_RELAY = 4;   // D4
constexpr int PIN_BUTTON = 33; // D33
/** DevKit V1 built-in LED (GPIO 2). Debug / hub connection indicator only. */
constexpr int PIN_STATUS_LED = 2;
/** Session accessory / external lock output (Dom Session in Progress). */
constexpr int PIN_SESSION_ACCESSORY = 32;

// Motor (BTS7960) — same firmware binary as relay; active backend from NVS actuator profile. Doc 31.
/** BTS7960 channel A (e.g. RPWM / R_EN on module) — primary direction. */
constexpr int PIN_MOTOR_PWM = 25;              // D25
constexpr int PIN_MOTOR_ENABLE = 27;           // D27
/** BTS7960 channel B (e.g. LPWM / L_EN) — opposite direction; v1 may use primary only. */
constexpr int PIN_MOTOR_PWM_SECONDARY = 26;    // D26
constexpr int PIN_MOTOR_ENABLE_SECONDARY = 14; // D14

/** BTS7960 module enable pin polarity (ESP output → module EN). Tune on bench — doc 31. */
constexpr bool MOTOR_ENABLE_ACTIVE_HIGH = true;
/** LEDC PWM frequency for motor channels (Hz). Tune on bench for audible noise / driver behavior. */
constexpr unsigned long MOTOR_PWM_FREQUENCY_HZ = 20000;

// Optional production straps (3 inputs → 3-bit actuatorProfileId at boot). Not v1 — see Documents/31-Motor-Actuator-Device-Design.md §2.4
// constexpr int PIN_ACTUATOR_STRAP_0 = TBD;
// constexpr int PIN_ACTUATOR_STRAP_1 = TBD;
// constexpr int PIN_ACTUATOR_STRAP_2 = TBD;

// Many opto relay modules are active-LOW — verify against module LED behavior in Phase 6
constexpr bool RELAY_ACTIVE_HIGH = true;
/** Session accessory output — same polarity convention as relay (verify wiring). */
constexpr bool SESSION_ACCESSORY_ACTIVE_HIGH = true;
/** Most ESP32 DevKit V1 boards: built-in LED is active-LOW (LOW = lit). */
constexpr bool STATUS_LED_ACTIVE_HIGH = true;
