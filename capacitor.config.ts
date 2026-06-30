import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.ledge.predictions',
  appName: 'Ledge',
  webDir: 'out',
  server: {
    url: 'https://ledge-phi.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A0A0B',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
