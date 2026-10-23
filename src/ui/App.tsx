import { useEffect, useState } from 'react';
import type { GameMode } from '../modes/play';
import type { Settings } from '../storage/settings';
import { loadSettings, saveSettings } from '../storage/settings';
import { Checklist } from './screens/Checklist';
import { Endgames } from './screens/Endgames';
import { Glossary } from './screens/Glossary';
import { HangingDrill } from './screens/HangingDrill';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Mistakes } from './screens/Mistakes';
import { Play } from './screens/Play';
import { ProgressScreen } from './screens/Progress';
import { SettingsScreen } from './screens/Settings';
import { Tactics } from './screens/Tactics';
import { ThreatDrill } from './screens/ThreatDrill';

type Route =
  | 'home'
  | 'play'
  | 'settings'
  | 'learn'
  | 'checklist'
  | 'glossary'
  | 'mistakes'
  | 'progress'
  | 'threat-drill'
  | 'hanging-drill'
  | 'tactics'
  | 'endgames';

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
    case 'learn':
      return (
        <Learn
          onChecklist={() => setRoute('checklist')}
          onGlossary={() => setRoute('glossary')}
          onMistakes={() => setRoute('mistakes')}
          onProgress={() => setRoute('progress')}
          onThreatDrill={() => setRoute('threat-drill')}
          onHangingDrill={() => setRoute('hanging-drill')}
          onTactics={() => setRoute('tactics')}
          onEndgames={() => setRoute('endgames')}
          onBack={() => setRoute('home')}
        />
      );
    case 'checklist':
      return <Checklist onBack={() => setRoute('learn')} />;
    case 'glossary':
      return <Glossary onBack={() => setRoute('learn')} />;
    case 'mistakes':
      return <Mistakes onBack={() => setRoute('learn')} touchMove={settings.touchMove} />;
    case 'progress':
      return <ProgressScreen onBack={() => setRoute('learn')} />;
    case 'threat-drill':
      return <ThreatDrill onBack={() => setRoute('learn')} />;
    case 'hanging-drill':
      return <HangingDrill onBack={() => setRoute('learn')} />;
    case 'tactics':
      return <Tactics settings={settings} onBack={() => setRoute('learn')} />;
    case 'endgames':
      return <Endgames touchMove={settings.touchMove} onBack={() => setRoute('learn')} />;
    case 'home':
    default:
      return (
        <Home
          onPlay={(mode, wantsResume) => {
            setPlayMode(mode);
            setResume(wantsResume);
            setRoute('play');
          }}
          onLearn={() => setRoute('learn')}
          onSettings={() => setRoute('settings')}
        />
      );
  }
}
