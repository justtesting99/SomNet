import { useCallback, useEffect, useState } from 'react';
import { fetchDeviceStatus, pairDevice, revokeDevicePairing } from '@/api/devices';
import { ApiError } from '@/api/client';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import type { DeviceStatusResponse } from '@/types/device';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getDeviceTokenExpiryInfo } from '@/utils/deviceTokenExpiry';

function formatStatusLine(status: DeviceStatusResponse | null): string {
  if (!status) {
    return 'Loading device status…';
  }

  if (status.isConnected && status.deviceId) {
    return `Connected — ${status.deviceId}`;
  }

  if (status.isPaired && status.deviceId) {
    return `Paired (${status.deviceId}) — waiting for device to connect`;
  }

  return `No device paired for ${status.subTarget}`;
}

function DeviceTokenExpiryNotice({ status }: { status: DeviceStatusResponse }) {
  if (!status.isPaired || !status.tokenExpiresAt) {
    return null;
  }

  const expiry = getDeviceTokenExpiryInfo(status.tokenExpiresAt);
  if (!expiry) {
    return null;
  }

  const toneClass =
    expiry.urgency === 'expired'
      ? 'border-amber-900/60 bg-amber-950/40 text-amber-200'
      : expiry.urgency === 'warn'
        ? 'border-amber-900/50 bg-amber-950/30 text-amber-100'
        : 'border-slate-800 bg-slate-950/40 text-slate-400';

  let headline = 'Pairing token expiry';
  let detail = `Re-pair before ${expiry.formattedEffectiveExpiry} to avoid interruption.`;

  if (expiry.urgency === 'expired') {
    headline = 'Pairing token expired';
    detail = 'Tap Pair device below to renew (same Device ID).';
  } else if (expiry.urgency === 'warn') {
    headline =
      expiry.daysRemaining <= 1
        ? 'Pairing token expires soon'
        : `Pairing token expires in ${expiry.daysRemaining} days`;
    detail = `Re-pair before ${expiry.formattedEffectiveExpiry} to stay connected.`;
  }

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${toneClass}`}>
      <p className="font-medium text-slate-200">{headline}</p>
      <p className="mt-1">
        Server expiry: <span className="text-slate-300">{expiry.formattedServerExpiry}</span>
      </p>
      <p className="mt-1">{detail}</p>
      <p className="mt-1 text-slate-500">
        The device may disconnect up to 5 minutes before the server expiry time.
      </p>
    </div>
  );
}

export function DevicePairingPanel({ active }: { active: boolean }) {
  const { selectedSub } = useSubTarget();
  const { refresh: refreshSystemStatus } = useSystemStatus();
  const [status, setStatus] = useState<DeviceStatusResponse | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const nextStatus = await fetchDeviceStatus(selectedSub);
      setStatus(nextStatus);
      if (nextStatus.deviceId) {
        setDeviceId(nextStatus.deviceId);
      }
    } catch (loadError) {
      const loadMessage =
        loadError instanceof ApiError && loadError.message
          ? loadError.message
          : 'Unable to load device status.';
      setError(loadMessage);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSub]);

  useEffect(() => {
    if (!active) {
      return;
    }

    setMessage('');
    setError('');
    setDeviceId('');
    void loadStatus();
  }, [active, selectedSub, loadStatus]);

  async function handlePair() {
    const trimmedId = deviceId.trim();
    if (!trimmedId) {
      setError('Device ID is required.');
      return;
    }

    setError('');
    setMessage('');
    setIsPairing(true);

    try {
      const response = await pairDevice(selectedSub, trimmedId);
      setMessage(
        response.message ??
          (response.deliveredToDevice
            ? 'Pairing token sent to device.'
            : 'Device paired — token saved; deliver when device connects.'),
      );
      await loadStatus();
      await refreshSystemStatus();
    } catch (pairError) {
      const pairMessage =
        pairError instanceof ApiError && pairError.message
          ? pairError.message
          : 'Unable to pair device.';
      setError(pairMessage);
    } finally {
      setIsPairing(false);
    }
  }

  async function handleRevoke() {
    if (!window.confirm(`Revoke hardware pairing for ${selectedSub}?`)) {
      return;
    }

    setError('');
    setMessage('');
    setIsRevoking(true);

    try {
      await revokeDevicePairing(selectedSub);
      setMessage('Pairing revoked.');
      setDeviceId('');
      await loadStatus();
      await refreshSystemStatus();
    } catch (revokeError) {
      const revokeMessage =
        revokeError instanceof ApiError && revokeError.message
          ? revokeError.message
          : 'Unable to revoke pairing.';
      setError(revokeMessage);
    } finally {
      setIsRevoking(false);
    }
  }

  const busy = isLoading || isPairing || isRevoking;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">Hardware device</h3>
      <p className="text-xs text-slate-500">
        Pair an ESP32 for <span className="text-slate-300">{selectedSub}</span>. Copy the device ID
        from the device config page (e.g. <span className="font-mono text-slate-400">esp32-…</span>
        ).
      </p>
      <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
        {formatStatusLine(status)}
      </p>
      {status ? <DeviceTokenExpiryNotice status={status} /> : null}
      <Input
        label="Device ID"
        value={deviceId}
        placeholder="esp32-84CCA85C36B4"
        onChange={(event) => setDeviceId(event.target.value)}
        disabled={busy}
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={handlePair} disabled={busy}>
          {isPairing ? 'Pairing…' : 'Pair device'}
        </Button>
        <Button
          variant="secondary"
          onClick={handleRevoke}
          disabled={busy || !status?.isPaired}
        >
          {isRevoking ? 'Revoking…' : 'Revoke pairing'}
        </Button>
      </div>
    </section>
  );
}
