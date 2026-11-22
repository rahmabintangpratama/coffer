# Release checklist for Coffer 0.1.0

- **Purpose:** every release-gate item for 0.1.0, with its status and where the evidence is, so the owner can see what is done by machine, what waits for them, and sign off.
- **Status:** Draft (automated items are done and pushed; items marked "Owner" wait for phase B).
- **Last updated:** 2026-11-22
- **Source files in `design/`:** none
- **Related:** [technical-spec.md](technical-spec.md) section 16 (release gate), [implementation-plan.md](implementation-plan.md) (M10), [manual-test-plan.md](manual-test-plan.md), [deploy-cloudflare-pages.md](deploy-cloudflare-pages.md), [security-audit-0.1.0.md](security-audit-0.1.0.md), [contrast-report.md](contrast-report.md), [../CHANGELOG.md](../CHANGELOG.md), [release-notes-0.1.0.md](release-notes-0.1.0.md)

**Status words:** Done (a machine checked it and the evidence is linked), Owner (needs your account, device or decision), Open (a known gap, with the entry that tracks it).

**CI evidence:** every CI link below is the run of the commit that closed M10 phase A. The run is named in the hand-over report; add its URL here when you sign off.

## 1. The release gate (technical-spec 16)

| # | Gate | Status | Evidence |
|---|---|---|---|
| G-1 | Headers verified on the preview deployment | Owner | Run `pnpm headers:check --url <preview-url>` ([deploy guide](deploy-cloudflare-pages.md) section 5). The same check on `dist/_headers` runs in CI (`pnpm headers:check`) and every e2e test runs under the real `_headers`. |
| G-2 | Bundle budgets met | Done | `pnpm size:check` and `tests/e2e/first-load.spec.ts` in CI. First route 100.0 KB gzip, entry 81.6 KiB. One gap: Unlock paints after 128.7 KiB of JavaScript against the 120 KiB spec number ([OQ-38](open-questions.md)). |
| G-3 | Security audit done | Done, with 4 checks for the owner | [security-audit-0.1.0.md](security-audit-0.1.0.md): 3 findings fixed, 4 leads need a provider or browser fact (S-4, S-5, S-9, S-11), 3 recorded for a decision. The audit ran without Claude Code's sandbox, so no target code was executed (section 1 of the report). |
| G-4 | Provider compatibility matrix run | Owner | [manual-test-plan.md](manual-test-plan.md) section B. |
| G-5 | Manual accessibility pass | Owner | [manual-test-plan.md](manual-test-plan.md) section F (VoiceOver macOS and iOS, NVDA). |
| G-6 | Real-iPhone Safari pass | Owner | [manual-test-plan.md](manual-test-plan.md) section E1. |
| G-7 | `LICENSE` (MIT) present | Done | [../LICENSE](../LICENSE). |
| G-8 | Version `0.1.0` notes drafted | Done | [../CHANGELOG.md](../CHANGELOG.md), [release-notes-0.1.0.md](release-notes-0.1.0.md). `package.json` still says `0.0.0`: bump it in the release commit (phase B). |

## 2. M10 hardening items ([implementation-plan.md](implementation-plan.md))

| # | Item | Status | Evidence |
|---|---|---|---|
| H-1 | axe on every screen and state at 375, 768 and 1440, both themes | Done in Chromium and WebKit; Firefox in CI | `tests/e2e/a11y.spec.ts` (routes, drawer, sheets) and `tests/e2e/a11y-states.spec.ts` (onboarding failures, every dialog, menu and sheet, Trash, Settings, switcher, lock screens, read-only). Zero serious or critical violations. The pass found and fixed muted text on a hovered selected row (D-50). |
| H-2 | Keyboard-only run of every flow with a keyboard path | Done in Chromium and WebKit; Firefox in CI | `tests/e2e/keyboard.spec.ts`: Files, selection and preview, menus and dialogs, Move, Share, Trash, New and upload, Settings and Unlock, Forget, skip link. Found and fixed: dialog fields did not take focus, and closing the Details panel at 1024 px and up dropped focus (D-50). |
| H-3 | Real-browser contrast check (technical-spec 15.7), danger-tonal re-checked | Done in Chromium and WebKit; Firefox in CI | [contrast-report.md](contrast-report.md): 254 pairs, none below the design's threshold except documented deviations, painted fills equal the tokens, the engines agree. Plain tonal on the light surface is also 1.19:1 (D-50, same reasoning as [ADR-006](adr/ADR-006-danger-tonal-contrast-deviation.md)). |
| H-4 | CSP: zero violations and zero console errors in the whole suite | Done in Chromium and WebKit; Firefox in CI | The guard in `tests/e2e/test.ts` fails any test on a console error, uncaught error or CSP violation, under the real `_headers`. It found one real problem (WebKit blob revoke, fixed) and the tests that block requests on purpose now say so (`expectConsole`). Closes the C-31 verification task. |
| H-5 | Full WebKit suite | Done at 1440 locally; all widths in CI | CI matrix `webkit-375`, `webkit-768`, `webkit-1440`. |
| H-6 | Firefox in the browser list (C-29) | Done in CI only | `firefox-375` and `firefox-1440` in the CI matrix. Playwright's Firefox does not start on the maintainer's macOS (D-50 item 7), so the first Firefox result is the first CI run. |
| H-7 | Stability: whole suite three times in Chromium and WebKit at two workers | See the hand-over report | Fixed root causes: [D-41 toast race](../tests/e2e/operations.spec.ts), rapid-key tests (`pressToMoveFocus`), macOS Ctrl+A. Anything not fixable is in the tracked flaky list in [open-questions.md](open-questions.md). |
| H-8 | Performance: Lighthouse CI and bundle-size check against technical-spec 14 | Done | `pnpm lighthouse` and the `lighthouse` CI job: mobile profile (4x CPU, 9 Mbps, 150 ms), production build, gzip, real `_headers`. Welcome: interactive 0.9 s, LCP 0.9 s, TBT 0, CLS 0, 112.9 KiB of JavaScript before the first paint. Unlock and Files inside the same limits except the Unlock JavaScript gap (OQ-38). Report: `lighthouse-report/` artifact. |
| H-9 | Local Network Access checks in Chrome stable, Edge, Safari and Firefox | Owner | [manual-test-plan.md](manual-test-plan.md) section D. Closes the manual part of OQ-35 and informs OQ-36. The Chromium behaviour is covered by `tests/e2e/local-network.spec.ts`. |
| H-10 | Provider compatibility matrix for the Popular presets and custom | Owner | [manual-test-plan.md](manual-test-plan.md) section B. |
| H-11 | Temporary credentials (AWS STS, R2) | Owner | [manual-test-plan.md](manual-test-plan.md) section C. |
| H-12 | antislop over UI and copy | Done | Copy keys: no em dashes, no buzzwords, no generic call-to-action labels, no fabricated numbers. Code: no `outline: none` without a replacement focus ring; every selected-row and dialog issue above came from this pass. The icon set (Lucide) and the selected-row stripe are from the approved design. |
| H-13 | Documentation updated; `LICENSE` present | Done | This file, [deploy guide](deploy-cloudflare-pages.md), [manual test plan](manual-test-plan.md), D-49, D-50, OQ-37, OQ-38. |

## 3. Known gaps carried into 0.1.0

| Gap | Where it is tracked | Decision |
|---|---|---|
| Unlock paints after 128.7 KiB of JavaScript, over the 120 KiB spec number | [OQ-38](open-questions.md) | Owner |
| "Remove connection" leaves the connection's journal rows and running transfers | [OQ-37](open-questions.md) | Owner |
| Firefox has no local run | D-50 item 7 | First CI run |
| Redirect, key-encoding, download-link and HTML-preview leads | [security-audit-0.1.0.md](security-audit-0.1.0.md) section 4 | Owner checks, matrix rows `core-15a` and the download step |

## 4. Sign-off

| Role | Name | Date | Notes |
|---|---|---|---|
| Owner | | | |
