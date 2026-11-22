interface ImportMetaEnv {
  /** Test builds lower the "Load all" cap (features/files/config.ts). */
  readonly VITE_COFFER_LOAD_ALL_CAP?: string;
  readonly VITE_COFFER_AUTOLOCK_TEST_MS?: string;
}

/** Number of provider presets, defined at build time (scripts/vite/provider-count.ts). */
declare const __PROVIDER_COUNT__: number;

/** The version in package.json, defined at build time (scripts/vite/app-version.ts). */
declare const __APP_VERSION__: string;
