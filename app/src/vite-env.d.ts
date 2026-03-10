/// <reference types="vite/client" />

interface AppRuntimeConfig {
  apiUrl?: string;
  wsUrl?: string;
}

interface DesktopApi {
  showItemInFolder: (filePath: string) => Promise<void>;
}

interface Window {
  __APP_RUNTIME_CONFIG__?: AppRuntimeConfig;
  __DESKTOP_API__?: DesktopApi;
}
