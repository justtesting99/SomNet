/** Set when a manual stroke/burst/abort was recorded; consumed when hardware pending clears. */
let pendingNotify = false;

export function markManualVideoCommandComplete(): void {
  pendingNotify = true;
}

export function consumeManualVideoCommandComplete(): boolean {
  if (!pendingNotify) {
    return false;
  }

  pendingNotify = false;
  return true;
}
