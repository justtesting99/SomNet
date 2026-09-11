/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VIDEO_FRONT_URL?: string;
  readonly VITE_VIDEO_REAR_URL?: string;
  readonly VITE_VIDEO_VIEWER_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
