/// <reference types="vite/client" />

import type { DesktopApi } from '../preload'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}

export {}
