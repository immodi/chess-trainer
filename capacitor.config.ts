import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chess.chesstrainer',
  appName: 'Chess Trainer',
  webDir: 'dist',
  android: {
    // Everything the app needs ships inside the APK.
    allowMixedContent: false,
  },
};

export default config;
