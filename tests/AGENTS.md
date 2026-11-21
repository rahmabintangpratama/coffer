# tests/

Integration tests, end-to-end tests and shared fixtures. Unit and component tests sit next to the code (`*.test.ts[x]`). Rules from [../AGENTS.md](../AGENTS.md) apply; strategy is [technical-spec](../docs/technical-spec.md) section 15.

## Layout

- `integration/`: Vitest in Node against the local S3 fixture (RustFS); `docker-compose.yml` starts it (image pinned by digest, tag in a comment; the same digest is in `.github/workflows/ci.yml`, and a test keeps them equal), `config.ts` holds the fake credentials, `global-setup.ts` creates the read-only and delete-denied users, and `capabilities.test.ts` is the acceptance test for any replacement server (C-48).
- `e2e/`: Playwright specs.
- `fixtures/`: fake credentials, hostile HTML, SVG and Markdown samples, sample files, provider payloads.

## Rules

- **Never use real cloud credentials.** Use the fixed fake keys in `tests/integration/config.ts`. A test that needs a real provider belongs in the manual compatibility matrix, not here.
- Name tests after the requirement: `AC-36.1 ...`. Group by FR.
- Integration: use a fresh bucket prefix per test; clean up in `afterEach`; inject faults through the S3 test middleware (crash after copy, after verify, mid-multipart, `SlowDown`, expired token).
- E2E runs against the production build served by `scripts/serve/dist-server.ts`, which applies `dist/_headers`; a CSP violation in the console fails the shell tests.
- E2E viewport matrix: **375, 768 and 1440**, light and dark for visual and axe checks. Chromium for every spec; WebKit and Firefox for smoke and layout.
- Every e2e screen runs axe (serious and critical must be zero). Add keyboard-only flows for every FR with a keyboard path.
- E2E asserts no secret appears in the DOM, URL, storage dump or network log (other than signed provider requests).
- Browser tests that call the S3 fixture serve their page from a real loopback server (`tests/e2e/connection-test.spec.ts`), not `page.route()`: Chromium blocks requests from a page it did not load from the network to loopback (OQ-35). Run the library code in the page by bundling an entry with `tests/e2e/bundle.ts`.
- XSS fixtures (hostile names, HTML, SVG, Markdown) must stay inert; add one when a new renderer lands.
- CORS: set rules per bucket with `PutBucketCors` (one bucket with a rule, one without); use Playwright route interception for `cors` versus `network` cases. Do not rely on a global CORS setting.
- No fixed sleeps; wait on conditions. Tests must pass offline from the repo plus Docker.
