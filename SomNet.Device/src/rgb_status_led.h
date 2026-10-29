#pragma once

#include <stddef.h>

/** Operator-visible states (RGB + /api/local/status rgbState). */
enum class RgbOperatorState {
    CredentialReset,
    Running,
    SessionActive,
    Ready,
    AwaitingDeviceButton,
    WifiUp,
    NoWifi,
};

struct RgbStatusInputs {
    bool credentialResetFlash = false;
    bool provisioningSoftAp = false;
    bool wifiStaUp = false;
    bool motionActive = false;
    /** Scene / session ON (operator). */
    bool sessionActive = false;
    /** Sub pressed device button (ready to begin). */
    bool subReady = false;
    /** Unlocked local Bearer or hub connected — yellow ladder allowed. */
    bool operatorAuthOk = false;
};

RgbOperatorState resolveRgbOperatorState(const RgbStatusInputs& in);
const char* rgbOperatorStateName(RgbOperatorState state);

class RgbStatusLed {
public:
    void begin();
    void poll(const RgbStatusInputs& inputs);

private:
    void writeChannels(bool r, bool g, bool b);
    void pollBlink(unsigned long intervalMs, bool r, bool g, bool b);
    void applySolid(bool r, bool g, bool b);

    unsigned long lastToggleMs_ = 0;
    bool blinkPhase_ = false;
    RgbOperatorState lastState_ = RgbOperatorState::NoWifi;
};
