#include "modes/automatic/programs/table_program.h"

#include <Arduino.h>

TableProgram::TableProgram(StrokeScheduleRow* rows, size_t count) : rows_(rows), count_(count) {}

TableProgram::~TableProgram() {
    delete[] rows_;
    rows_ = nullptr;
    count_ = 0;
}

void TableProgram::getStrokeParameters(
    int strokeIndex,
    const AutomaticConfig& /*config*/,
    int& powerPercent,
    int& gapSec) const {
    if (rows_ == nullptr || count_ == 0) {
        powerPercent = 0;
        gapSec = 0;
        return;
    }

    if (strokeIndex < 0) {
        strokeIndex = 0;
    }

    const size_t index =
        static_cast<size_t>(strokeIndex) >= count_ ? count_ - 1 : static_cast<size_t>(strokeIndex);

    powerPercent = rows_[index].powerPercent;
    gapSec = rows_[index].gapSec;
}
