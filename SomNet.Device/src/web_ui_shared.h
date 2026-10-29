#pragma once

#include <Arduino.h>
#include <stddef.h>

namespace SomNetWebUi {

/** SomNet.UI-aligned rules only (PROGMEM) — served at GET /ui/somnet.css. */
extern const char kCssRules[] PROGMEM;

void appendProgmemStr(char* out, size_t outLen, size_t* offset, const char* progmemText);
/** Opens document head; caller must close head and open body/shell. */
void appendHtmlHeadOpen(char* out, size_t outLen, size_t* offset, const char* title);

/**
 * App shell header. activePage: "status" | "operate" | "config" | "" (no nav highlight).
 * includeOperateLink: show Control panel when local API enabled.
 */
void appendShellHeader(
    char* out,
    size_t outLen,
    size_t* offset,
    const char* activePage,
    bool includeOperateLink,
    bool includeStatusPill = false);

void appendShellMainOpen(char* out, size_t outLen, size_t* offset, bool wide);
void appendShellClose(char* out, size_t outLen, size_t* offset);

} // namespace SomNetWebUi
