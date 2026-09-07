import { MOBILE_VIDEO_EXPAND_OPTIONS, type AppOptions } from '@/types/options';
import type { MobileVideoExpandDefault } from '@/types/options';
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
          label="Auto-expand video feeds on mobile when commands run"
          checked={pendingOptions.autoExpandVideoOnMobile}
          onChange={(event) => onUpdate('autoExpandVideoOnMobile', event.target.checked)}
        />
        <SelectField
          label="Default mobile video feed on command"
          value={pendingOptions.mobileVideoExpandDefault}
          disabled={!pendingOptions.autoExpandVideoOnMobile}
          options={MOBILE_VIDEO_EXPAND_OPTIONS}
          onChange={(event) =>
            onUpdate('mobileVideoExpandDefault', event.target.value as MobileVideoExpandDefault)
          }
        />
        <NumberField
          label="System status reconnect interval (seconds)"
          value={pendingOptions.reconnectIntervalSeconds}
          min={5}
          max={120}
          onChange={(event) => onUpdate('reconnectIntervalSeconds', Number(event.target.value))}
        />
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
