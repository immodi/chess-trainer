import { useEffect, useState } from 'react';
import type { GameMode } from '../modes/play';
import type { Settings } from '../storage/settings';
import { loadSettings, saveSettings } from '../storage/settings';
import { Checklist } from './screens/Checklist';
import { Home } from './screens/Home';
import { Play } from './screens/Play';
import { SettingsScreen } from './screens/Settings';

type Route = 'home' | 'play' | 'settings' | 'checklist';

export function App() {
  const [route, setRoute] = useState<Route>('home');
  const [playMode, setPlayMode] = useState<GameMode>('practice');
  const [resume, setResume] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSettings().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings) {
    return (
      <main className="app">
        <p className="screen__note">Loading…</p>
      </main>
    );
  }

  const updateSettings = (next: Settings): void => {
    setSettings(next);
    void saveSettings(next);
  };

  switch (route) {
    case 'play':
      return (
        <Play
          settings={settings}
          mode={playMode}
          resume={resume}
          onExit={() => {
            setResume(false);
            setRoute('home');
          }}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          settings={settings}
          onChange={updateSettings}
          onBack={() => setRoute('home')}
        />
      );
    case 'checklist':
      return <Checklist onBack={() => setRoute('home')} />;
    case 'home':
    default:
      return (
        <Home
          onPlay={(mode, wantsResume) => {
            setPlayMode(mode);
            setResume(wantsResume);
            setRoute('play');
          }}
          onChecklist={() => setRoute('checklist')}
          onSettings={() => setRoute('settings')}
        />
      );
  }
}
