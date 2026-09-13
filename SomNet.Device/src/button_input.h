#pragma once

enum class ButtonClickKind {
    Single,
    Double,
};

using ButtonClickHandler = void (*)(ButtonClickKind kind, void* context);

class ButtonInput {
public:
    void begin();
    void poll();
    void setClickHandler(ButtonClickHandler handler, void* context);
    /** True after 10 s reset until operator releases the button (then reboot). */
    bool isAwaitingCredentialResetRelease() const { return credentialResetAwaitRelease_; }

private:
    void handleCredentialResetHold(bool pressed);
    void onPressEdge();
    void onReleaseEdge();
    void pollPendingSingle();
    void emitClick(ButtonClickKind kind);

    ButtonClickHandler clickHandler_ = nullptr;
    void* clickContext_ = nullptr;

    bool debouncedPressed_ = false;
    bool lastRawPressed_ = false;
    unsigned long lastDebounceMs_ = 0;

    bool lastPressed_ = false;
    unsigned long lastLogMs_ = 0;
    unsigned long pressStartedMs_ = 0;
    bool credentialResetWarned_ = false;
    bool credentialResetTriggered_ = false;
    bool credentialResetAwaitRelease_ = false;

    bool pendingSingle_ = false;
    unsigned long singleFireAtMs_ = 0;
};
