#pragma once

// ESP32 DevKit V1 clone — update here if wiring changes (see Documents/09-ESP32-Device-Plan.md §1.3)

constexpr int PIN_RELAY = 4;   // D4
constexpr int PIN_BUTTON = 33; // D33
/** DevKit V1 built-in LED (GPIO 2). Debug / hub connection indicator only. */
constexpr int PIN_STATUS_LED = 2;
/** Session accessory / external lock output (Dom Session in Progress). */
constexpr int PIN_SESSION_ACCESSORY = 32;

// Motor (BTS7960) — same firmware binary as relay; active backend from NVS actuator profile. Doc 31.
/** PWM to module LPWM (bench: D25). Opposite rotation vs PIN_MOTOR_PWM_SECONDARY. */
constexpr int PIN_MOTOR_PWM = 25; // D25
/** Shared enable when MOTOR_ENABLES_GANGED_ON_D27; else primary-side EN (e.g. R_EN). */
constexpr int PIN_MOTOR_ENABLE = 27; // D27
/** PWM to module RPWM (bench: D26). */
constexpr int PIN_MOTOR_PWM_SECONDARY = 26; // D26
/** Secondary enable (e.g. L_EN) — unused when enables are ganged on D27. */
constexpr int PIN_MOTOR_ENABLE_SECONDARY = 14; // D14

constexpr int PIN_LED_R = 23 // D23
constexpr int PIN_LED_G = 22 // D22
constexpr int PIN_LED_B = 1  // D1

/** BTS7960 module enable pin polarity (ESP output → module EN). Tune on bench — doc 31. */
constexpr bool MOTOR_ENABLE_ACTIVE_HIGH = true;
/** Both module EN inputs tied to D27; D14 not used. */
constexpr bool MOTOR_ENABLES_GANGED_ON_D27 = true;
/**
 * Forward rotation PWM pin: false = D25 (LPWM), true = D26 (RPWM).
 * If the load spins the wrong way, flip this (same as swapping D25/D26 wires).
 */
constexpr bool MOTOR_FORWARD_PWM_ON_D26 = true;
/** LEDC PWM frequency for motor channels (Hz). Bench: 5 kHz matched to BTS7960 module (2026-10-26). */
constexpr unsigned long MOTOR_PWM_FREQUENCY_HZ = 5000;
/**
 * Motor automatic burst micro-hold after ramp reaches burst duty (ms). MA-D26 / M1d — canonical
 * value in `modes/motor/motor_automatic_burst.h` (`kMotorBurstMicroHoldMs`, bench 300 ms).
 */

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
