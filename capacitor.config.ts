import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.a2z.billing',
  appName: 'A2Z Billing',
  webDir: 'client/dist',
  server: {
    url: process.env.CAPACITOR_SERVER_URL || 'https://billing.atriowings.in',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#6D28D9',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#49364A',
      showSpinner: false,
    },
  },
};

export default config;
