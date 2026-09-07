#pragma once

#include "modes/automatic/automatic_config.h"

#include <stddef.h>

/** Pre-computed stroke row (Phase C — wave + build-up). */
struct StrokeScheduleRow {
    int powerPercent = 0;
    int gapSec = 0;
};

/** Max rows ≈ 16 KB at 8 bytes/row; see P9P2-D40. */
constexpr size_t kMaxAutomaticScheduleRows = 2048;

bool buildStrokeSchedule(
    const AutomaticConfig& config,
    StrokeScheduleRow** outRows,
    size_t* outCount);

void freeStrokeSchedule(StrokeScheduleRow* rows);
