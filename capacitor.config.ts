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
    SystemBars: {
      insetsHandling: 'disable',
      style: 'DARK',
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#0F2D2E',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0F2D2E',
      showSpinner: false,
    },
  },
};

export default config;
