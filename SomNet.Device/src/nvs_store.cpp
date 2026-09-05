#include "nvs_store.h"

bool NvsStore::begin() {
    // Phase 2: Preferences / nvs_flash for token and config
    open_ = true;
    paired_ = false;
    return true;
}

void NvsStore::end() {
    open_ = false;
}

bool NvsStore::isPaired() const {
    return paired_;
}
