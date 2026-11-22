# src/features/onboarding/

Welcome to a tested connection (FR-1 to FR-7, FR-12, FR-110). Rules from [../../AGENTS.md](../../AGENTS.md) apply.

- **Keys.** The form holds the keys only while it is open. On submit they go to `lib/storage/vault` (`vault.put`), and everything that leaves the form is built with `withoutSecrets` and `planOf` (`form-model.ts`). The flow, its state and every prop carry a `ConnectionPlan` and values that are not keys. Do not add a field that holds a key to flow state, and do not log or render one. Going back shows the secret fields empty (D-27).
- **Flow.** `OnboardingFlow` is the only place that moves between steps: welcome, provider, credentials, connecting, pick. Each step is its own screen file with its own tests. `index.ts` exports only `OnboardingFlow`. `SaveDeviceScreen` (O51, after a passing test) and `UnlockScreen` (O60 to O62, also the Locked screen) live here too; the app loads `UnlockScreen` as its own chunk by path, so a device with saved connections opens on it without the shell (D-43). The passphrase lives in component state until the save or unlock ends.
- **S3 is lazy.** `ConnectingScreen` loads `@/lib/s3` with a dynamic `import()`. Import only `@/lib/s3/cors` and `@/lib/s3/local-network` statically.
- **Local network access.** The pre-prompt and the remediation live in `ConnectingScreen`. The browser prompt must never fire before the person presses `Continue` or `Connect`; the page's own address decides whether to ask (`needsLocalNetworkPermission`).
- **Copy.** Group `ob` is loaded by `CopyBoundary` in `src/app/App.tsx` for Welcome; `form` and `conn` by the one in `OnboardingFlow` before `ConnectFlow`, a lazy chunk (D-40). Call `t()` inside components, never in a module-level constant.
- **Focus.** `StepFrame` moves focus to the step heading and sets the document title. A screen that changes what it shows (a failure, success) is remounted with a `key` so focus follows.
- **Tests.** Name them after the AC (`AC-3.4 ...`). Mock `@/lib/s3` (`createClient`, `runConnectionTest`) in component tests; the real browser run is `tests/e2e/onboarding.spec.ts`.
