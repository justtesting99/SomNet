import { useCallback, useEffect, useRef, useState } from 'react';
import type { SubTargetName } from '@/config/sessionUsers';
import { fetchSubs } from '@/api/subs';
import {
  fetchDeviceStatus,
  fetchUnpairedDevices,
  pairDevice,
  revokeDevicePairing,
} from '@/api/devices';
import { ApiError } from '@/api/client';
import { useHardwareDialog } from '@/context/HardwareProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import type { DeviceStatusResponse, UnpairedDeviceResponse } from '@/types/device';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getDeviceTokenExpiryInfo } from '@/utils/deviceTokenExpiry';
import { formatSessionDateTimeDisplay } from '@/utils/dateTimeLocal';

type HardwareTab = 'all-subs' | 'online' | 'paste-id';

interface SubHardwareRow {
  subTarget: SubTargetName;
  status: DeviceStatusResponse | null;
  loadError?: string;
}

function connectionLabel(status: DeviceStatusResponse | null): string {
  if (!status) {
    return 'Unknown';
  }

  if (status.isConnected && status.deviceId) {
    return 'Connected';
  }

  if (status.isPaired && status.deviceId) {
    return 'Paired (offline)';
  }

  return 'Not paired';
}

function expiryRowClass(status: DeviceStatusResponse | null): string {
  if (!status?.isPaired || !status.tokenExpiresAt) {
    return '';
  }

  const expiry = getDeviceTokenExpiryInfo(status.tokenExpiresAt);
  if (!expiry) {
    return '';
  }

  if (expiry.urgency === 'expired') {
    return 'bg-red-950/40';
  }

  if (expiry.urgency === 'warn') {
    return 'bg-amber-950/30';
  }

  return '';
}

function expiryLabel(status: DeviceStatusResponse | null): string {
  if (!status?.isPaired || !status.tokenExpiresAt) {
    return '—';
  }

  const expiry = getDeviceTokenExpiryInfo(status.tokenExpiresAt);
  if (!expiry) {
    return '—';
  }

  if (expiry.urgency === 'expired') {
    return 'Expired';
  }

  if (expiry.urgency === 'warn') {
    return `Soon (${expiry.daysRemaining}d)`;
  }

  return expiry.formattedServerExpiry;
}

export function HardwareDialog() {
  const { isDialogOpen, closeDialog } = useHardwareDialog();
  const { selectedSub } = useSubTarget();
  const { refresh: refreshSystemStatus, status: systemStatus } = useSystemStatus();
  const [activeTab, setActiveTab] = useState<HardwareTab>('all-subs');
  const [rows, setRows] = useState<SubHardwareRow[]>([]);
  const [unpairedDevices, setUnpairedDevices] = useState<UnpairedDeviceResponse[]>([]);
  const [pairSubTarget, setPairSubTarget] = useState<SubTargetName>(selectedSub);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [busySub, setBusySub] = useState<SubTargetName | null>(null);
  const skipNextStatusSyncRef = useRef(false);

  const loadAll = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoading(true);
    }
    setError('');

    try {
      const subs = await fetchSubs();
      const statuses = await Promise.all(
        subs.map(async (subTarget) => {
          try {
            const status = await fetchDeviceStatus(subTarget);
            return { subTarget, status } satisfies SubHardwareRow;
          } catch (loadError) {
            const loadMessage =
              loadError instanceof ApiError && loadError.message
                ? loadError.message
                : 'Unable to load status.';
            return { subTarget, status: null, loadError: loadMessage } satisfies SubHardwareRow;
          }
        }),
      );

      const unpaired = await fetchUnpairedDevices();
      setRows(statuses);
      setUnpairedDevices(unpaired);
      setPairSubTarget((current) =>
        subs.includes(current) ? current : subs.includes(selectedSub) ? selectedSub : subs[0],
      );
    } catch (loadError) {
      const loadMessage =
        loadError instanceof ApiError && loadError.message
          ? loadError.message
          : 'Unable to load hardware data.';
      if (!silent) {
        setError(loadMessage);
        setRows([]);
        setUnpairedDevices([]);
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [selectedSub]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    setActiveTab('all-subs');
    setDeviceId('');
    setMessage('');
    setError('');
    skipNextStatusSyncRef.current = true;
    void loadAll();
  }, [isDialogOpen, loadAll]);

  useEffect(() => {
    if (!isDialogOpen || systemStatus.lastChecked === null) {
      return;
    }

    if (skipNextStatusSyncRef.current) {
      skipNextStatusSyncRef.current = false;
      return;
    }

    void loadAll({ silent: true });
  }, [isDialogOpen, systemStatus.lastChecked, loadAll]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen, closeDialog]);

  if (!isDialogOpen) {
    return null;
  }

  async function handlePair(subTarget: SubTargetName, targetDeviceId: string) {
    const trimmedId = targetDeviceId.trim();
    if (!trimmedId) {
      setError('Device ID is required.');
      return;
    }

    setError('');
    setMessage('');
    setBusySub(subTarget);

    try {
      const response = await pairDevice(subTarget, trimmedId);
      setMessage(
        response.message ??
          (response.deliveredToDevice
            ? `Pairing token sent to ${trimmedId}.`
            : `Device paired for ${subTarget}; token saved for delivery on connect.`),
      );
      await loadAll();
      await refreshSystemStatus();
    } catch (pairError) {
      const pairMessage =
        pairError instanceof ApiError && pairError.message
          ? pairError.message
          : 'Unable to pair device.';
      setError(pairMessage);
    } finally {
      setBusySub(null);
    }
  }

  async function handleRevoke(subTarget: SubTargetName) {
    if (!window.confirm(`Revoke hardware pairing for ${subTarget}?`)) {
      return;
    }

    setError('');
    setMessage('');
    setBusySub(subTarget);

    try {
      await revokeDevicePairing(subTarget);
      setMessage(`Pairing revoked for ${subTarget}.`);
      await loadAll();
      await refreshSystemStatus();
    } catch (revokeError) {
      const revokeMessage =
        revokeError instanceof ApiError && revokeError.message
          ? revokeError.message
          : 'Unable to revoke pairing.';
      setError(revokeMessage);
    } finally {
      setBusySub(null);
    }
  }

  const busy = isLoading || busySub !== null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        className="flex max-h-[min(90dvh,820px)] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hardware-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-800 px-5 py-4">
          <h2 id="hardware-dialog-title" className="text-lg font-semibold text-white">
            Hardware
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Pair ESP32 devices to Subs, review connection state, and manage token expiry.
          </p>
        </header>

        <div className="flex shrink-0 gap-2 border-b border-slate-800 px-5 py-3">
          {(
            [
              ['all-subs', 'All Subs'],
              ['online', 'Online now'],
              ['paste-id', 'Enter device ID'],
            ] as const
          ).map(([tab, label]) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
          {message ? <p className="mb-3 text-sm text-emerald-400">{message}</p> : null}

          {activeTab === 'all-subs' ? (
            <div className="overflow-x-auto">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading hardware status…</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Sub</th>
                      <th className="px-2 py-2">Device ID</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Token expiry</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.subTarget}
                        className={`border-t border-slate-800 ${expiryRowClass(row.status)}`}
                      >
                        <td className="px-2 py-3 font-medium text-slate-200">{row.subTarget}</td>
                        <td className="px-2 py-3 font-mono text-xs text-slate-300">
                          {row.status?.deviceId ?? '—'}
                        </td>
                        <td className="px-2 py-3 text-slate-300">
                          {row.loadError ?? connectionLabel(row.status)}
                        </td>
                        <td className="px-2 py-3 text-slate-300">{expiryLabel(row.status)}</td>
                        <td className="px-2 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setActiveTab('paste-id');
                                setPairSubTarget(row.subTarget);
                                setDeviceId(row.status?.deviceId ?? '');
                              }}
                            >
                              Pair
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy || !row.status?.isPaired}
                              onClick={() => void handleRevoke(row.subTarget)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {activeTab === 'online' ? (
            <div className="space-y-4">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading online devices…</p>
              ) : unpairedDevices.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No unpaired devices are connected right now. Use Enter device ID if the device
                  is offline.
                </p>
              ) : (
                <ul className="space-y-2">
                  {unpairedDevices.map((device) => (
                    <li
                      key={device.deviceId}
                      className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-sm text-slate-200">{device.deviceId}</p>
                        <p className="text-xs text-slate-500">
                          Connected {formatSessionDateTimeDisplay(device.connectedAt)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-xs text-slate-400">
                          Pair to Sub
                          <select
                            className="ml-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
                            value={pairSubTarget}
                            disabled={busy}
                            onChange={(event) =>
                              setPairSubTarget(event.target.value as SubTargetName)
                            }
                          >
                            {rows.map((row) => (
                              <option key={row.subTarget} value={row.subTarget}>
                                {row.subTarget}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void handlePair(pairSubTarget, device.deviceId)}
                        >
                          Pair
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {activeTab === 'paste-id' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Copy the device ID from the ESP32 status page (e.g.{' '}
                <span className="font-mono text-slate-300">esp32-84CCA85C36B4</span>).
              </p>
              <label className="block text-sm text-slate-300">
                Pair to Sub
                <select
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  value={pairSubTarget}
                  disabled={busy}
                  onChange={(event) => setPairSubTarget(event.target.value as SubTargetName)}
                >
                  {rows.map((row) => (
                    <option key={row.subTarget} value={row.subTarget}>
                      {row.subTarget}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Device ID"
                value={deviceId}
                placeholder="esp32-84CCA85C36B4"
                disabled={busy}
                onChange={(event) => setDeviceId(event.target.value)}
              />
              <Button disabled={busy} onClick={() => void handlePair(pairSubTarget, deviceId)}>
                {busySub === pairSubTarget ? 'Pairing…' : 'Pair device'}
              </Button>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <Button variant="ghost" onClick={() => void loadAll()} disabled={busy}>
            Refresh
          </Button>
          <Button variant="secondary" onClick={closeDialog}>
            Close
          </Button>
        </footer>
      </div>
    </div>
  );
}
