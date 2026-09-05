#pragma once

class NvsStore {
public:
    bool begin();
    void end();
    bool isPaired() const;

private:
    bool open_ = false;
    bool paired_ = false;
};
