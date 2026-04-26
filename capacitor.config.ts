import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.orderbook.app',
  appName: 'Order Book',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
