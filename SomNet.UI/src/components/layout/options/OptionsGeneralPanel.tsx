import {
  ACTION_SNAPSHOT_FEED_OPTIONS,
  LIVE_VIDEO_FEEDS_OPTIONS,
  MOBILE_VIDEO_EXPAND_OPTIONS,
  VIDEO_FEED_BANDWIDTH_OPTIONS,
  type ActionSnapshotFeeds,
  type AppOptions,
  type LiveVideoFeeds,
  type MobileVideoExpandDefault,
  type VideoFeedBandwidth,
} from '@/types/options';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/RadioGroup';

interface OptionsGeneralPanelProps {
  pendingOptions: AppOptions;
  onUpdate: <K extends keyof AppOptions>(key: K, value: AppOptions[K]) => void;
}

export function OptionsGeneralPanel({ pendingOptions, onUpdate }: OptionsGeneralPanelProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Operation</h3>
        <Checkbox
          label="Confirm before stroke or burst commands"
          checked={pendingOptions.confirmBeforeCommands}
          onChange={(event) => onUpdate('confirmBeforeCommands', event.target.checked)}
        />
        <Checkbox
          label="Allow automatic mode overrides while a session is running"
          checked={pendingOptions.allowAutomaticModeOverrides}
          onChange={(event) =>
            onUpdate('allowAutomaticModeOverrides', event.target.checked)
          }
        />
        <p className="text-xs leading-relaxed text-slate-500">
          When enabled, automatic settings stay editable during a session and changes are sent to
          the device after the current stroke. When disabled, settings lock until Stop or Abort.
        </p>
        <SelectField
          label="Live video feeds"
          value={pendingOptions.liveVideoFeeds}
          options={LIVE_VIDEO_FEEDS_OPTIONS}
          onChange={(event) =>
            onUpdate('liveVideoFeeds', event.target.value as LiveVideoFeeds)
          }
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Controls whether live front/rear monitors appear on the dashboard. Choose{' '}
          <span className="text-slate-400">None</span> to hide all feeds and give the control panel
          the full width.
        </p>
        <p className="text-xs leading-relaxed text-slate-500">
          <span className="font-medium text-slate-400">Per device (planned):</span> camera areas and
          feed URLs will be assignable separately for each paired device — for example a motor may
          use one set of feeds, a relay another, or any combination may share the same cameras. This
          operator-wide setting applies until per-device video is enabled.
        </p>
        <SelectField
          label="Mobile full-screen feeds"
          value={pendingOptions.mobileVideoExpandDefault}
          options={MOBILE_VIDEO_EXPAND_OPTIONS}
          onChange={(event) =>
            onUpdate('mobileVideoExpandDefault', event.target.value as MobileVideoExpandDefault)
          }
        />
        <p className="text-xs leading-relaxed text-slate-500">
          When auto-expand is on, which monitors open full screen on mobile after a command. Only
          applies when live feeds are not set to None.
        </p>
        <SelectField
          label="Video feed bandwidth"
          value={pendingOptions.videoFeedBandwidth}
          options={VIDEO_FEED_BANDWIDTH_OPTIONS}
          onChange={(event) =>
            onUpdate('videoFeedBandwidth', event.target.value as VideoFeedBandwidth)
          }
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Medium and low use ffmpeg transcoded go2rtc streams (see SomNet.Edge go2rtc.yaml). Helpful
          on LTE or Cloudflare tunnel links. Snapshots stay full quality.
        </p>
        <Checkbox
          label="Auto-expand video feeds on mobile when commands run"
          checked={pendingOptions.autoExpandVideoOnMobile}
          onChange={(event) => onUpdate('autoExpandVideoOnMobile', event.target.checked)}
        />
        <p className="text-xs leading-relaxed text-slate-500">
          On mobile, opens the mobile full-screen feed selection after each command (when enabled
          and live feeds are visible).
        </p>
        <NumberField
          label="System status reconnect interval (seconds)"
          value={pendingOptions.reconnectIntervalSeconds}
          min={5}
          max={120}
          onChange={(event) => onUpdate('reconnectIntervalSeconds', Number(event.target.value))}
        />
        <NumberField
          label="Video feed timeout (seconds)"
          value={pendingOptions.videoFeedTimeoutSeconds}
          min={5}
          max={600}
          onChange={(event) => onUpdate('videoFeedTimeoutSeconds', Number(event.target.value))}
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Manual: hide live feeds this long after each stroke or burst (bursts stay visible until
          complete). Automatic: keep feeds this long after Stop or Abort before hiding.
        </p>
        <SelectField
          label="Action snapshot cameras"
          value={pendingOptions.actionSnapshotFeeds}
          options={ACTION_SNAPSHOT_FEED_OPTIONS}
          onChange={(event) =>
            onUpdate('actionSnapshotFeeds', event.target.value as ActionSnapshotFeeds)
          }
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Stills captured after each stroke or burst ack. Rear only skips the front camera when
          stream delay makes the expression feed less useful for outcome review.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Display</h3>
        <Input
          label="Operator display name override"
          value={pendingOptions.operatorDisplayName}
          placeholder="Leave blank to use login name"
          onChange={(event) => onUpdate('operatorDisplayName', event.target.value)}
        />
        <Input
          label="Default session notes prefix"
          value={pendingOptions.defaultNotesPrefix}
          onChange={(event) => onUpdate('defaultNotesPrefix', event.target.value)}
        />
      </section>
    </div>
  );
}
