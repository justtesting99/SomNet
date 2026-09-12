let commandCompletePending = false;

export function markManualVideoCommandComplete(): void {
  commandCompletePending = true;
}

export function consumeManualVideoPendingNotify(): boolean {
  if (!commandCompletePending) {
    return false;
  }

  commandCompletePending = false;
  return true;
}

/** @deprecated Use consumeManualVideoPendingNotify */
export function consumeManualVideoCommandComplete(): boolean {
  return consumeManualVideoPendingNotify();
}
