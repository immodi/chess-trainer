import type { Settings, ThreatCheckMode } from '../../storage/settings';

export interface SettingsProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onBack: () => void;
}

const THREAT_OPTIONS: readonly { value: ThreatCheckMode; label: string; hint: string }[] = [
  { value: 'always', label: 'Always ask', hint: 'Before every move, even when nothing is threatened.' },
  {
    value: 'whenThreatExists',
    label: 'Only when there is a threat',
    hint: 'The prompt appearing tells you something is up.',
  },
  { value: 'off', label: 'Off', hint: 'No questions. Just play.' },
];

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function Option({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`option ${selected ? 'option--selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="option__label">{label}</span>
      {hint ? <span className="option__hint">{hint}</span> : null}
    </button>
  );
}

export function SettingsScreen({ settings, onChange, onBack }: SettingsProps) {
  const update = (patch: Partial<Settings>): void => onChange({ ...settings, ...patch });
  const fixedLevel = settings.opponentLevel === 'adaptive' ? 2 : settings.opponentLevel;

  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back
        </button>
        <h1>Settings</h1>
      </header>

      <section className="settings__group">
        <h2 className="settings__title">Opponent</h2>
        <Option
          label="Adaptive"
          hint="The computer adjusts after each game."
          selected={settings.opponentLevel === 'adaptive'}
          onClick={() => update({ opponentLevel: 'adaptive' })}
        />
        <Option
          label="Fixed level"
          hint="Pick a strength and keep it."
          selected={settings.opponentLevel !== 'adaptive'}
          onClick={() => update({ opponentLevel: fixedLevel })}
        />
        {settings.opponentLevel !== 'adaptive' ? (
          <div className="level-picker" role="group" aria-label="Opponent level">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={`level-picker__level ${
                  settings.opponentLevel === level ? 'level-picker__level--selected' : ''
                }`}
                aria-pressed={settings.opponentLevel === level}
                onClick={() => update({ opponentLevel: level })}
              >
                {level}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="settings__group">
        <h2 className="settings__title">Moving pieces</h2>
        <Option
          label="Touch-move"
          hint="Once you pick up a piece, you must move that piece. Like a real board."
          selected={settings.touchMove}
          onClick={() => update({ touchMove: true })}
        />
        <Option
          label="Free selection"
          hint="Tap a piece, change your mind, tap another."
          selected={!settings.touchMove}
          onClick={() => update({ touchMove: false })}
        />
      </section>

      <section className="settings__group">
        <h2 className="settings__title">Threat check</h2>
        {THREAT_OPTIONS.map((option) => (
          <Option
            key={option.value}
            label={option.label}
            hint={option.hint}
            selected={settings.threatCheck === option.value}
            onClick={() => update({ threatCheck: option.value })}
          />
        ))}
      </section>

      <p className="screen__note">Settings are saved on this device and work offline.</p>
    </main>
  );
}
