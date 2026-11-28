# tests/

Integration tests, end-to-end tests and shared fixtures. Unit and component tests sit next to the code (`*.test.ts[x]`). Rules from [../AGENTS.md](../AGENTS.md) apply; strategy is [technical-spec](../docs/technical-spec.md) section 15.

## Layout

- `integration/`: Vitest in Node against the local S3 fixture (RustFS); `docker-compose.yml` starts it (image pinned by digest, tag in a comment; the same digest is in `.github/workflows/ci.yml`, and a test keeps them equal), `config.ts` holds the fake credentials, `global-setup.ts` creates the read-only and delete-denied users, and `capabilities.test.ts` is the acceptance test for any replacement server (C-48).
- `e2e/`: Playwright specs.
- `fixtures/`: fake credentials, hostile HTML, SVG and Markdown samples, sample files, provider payloads.

## Rules

- **Never use real cloud credentials.** Use the fixed fake keys in `tests/integration/config.ts`.
- Fake keys must not look real to secret scanners. GitHub push protection blocked a Tencent-style `AKID` plus 32 characters id in a fixture. Build fakes from obvious words of the right length (`tencent-example-id-000…`), never from a provider's real key pattern. If a push is blocked, fix the string in the unpushed commits; do not use the "allow this secret" link. A test that needs a real provider belongs in the manual compatibility matrix, not here.
- Name tests after the requirement: `AC-36.1 ...`. Group by FR.
- **Leave the fixture as you found it.** An e2e test writes only under `scratchPrefix(area)` (`e2e/scratch.ts`) or into a bucket from `createBucket`; both are removed after the test, with their trash and unfinished uploads. A bucket made in `beforeAll` is deleted in `afterAll`. A test that reads a whole-bucket view (Trash, Storage, bucket search) uses its own bucket. Each e2e run starts by emptying the fixture (`resetFixture`), and integration buckets are deleted when their file ends. Deleting refuses to run unless the endpoint is on this machine and the configured access key is the one in `docker-compose.yml` (`assertTestFixture`). Never run e2e and integration against one fixture at the same time.
- Integration: use a fresh bucket prefix per test; inject faults through the S3 test middleware (crash after copy, after verify, mid-multipart, `SlowDown`, expired token).
- E2E runs against the production build served by `scripts/serve/dist-server.ts`, which applies `dist/_headers`; a CSP violation in the console fails the shell tests.
- E2E viewport matrix: **375, 768 and 1440**, light and dark for visual and axe checks. Chromium for every spec; WebKit and Firefox for smoke and layout.
- Every e2e screen runs axe (serious and critical must be zero), through `axeViolations` or `axeFor`: Firefox needs the older axe-core they give it (D-52). Add keyboard-only flows for every FR with a keyboard path.
- E2E asserts no secret appears in the DOM, URL, storage dump or network log (other than signed provider requests).
- Browser tests that call the S3 fixture serve their page from a real loopback server (`tests/e2e/connection-test.spec.ts`), not `page.route()`: Chromium blocks requests from a page it did not load from the network to loopback (OQ-35). Run the library code in the page by bundling an entry with `tests/e2e/bundle.ts`.
- Every spec that needs the app shell calls `enterApp(page, route)` (`tests/e2e/helpers.ts`), which connects to the S3 fixture through the real onboarding screens. Sessions are memory-only, so a reload or `page.goto` drops the keys: change route with `goToRoute`. `global-setup.ts` creates the shared bucket `coffer-e2e-app` (CORS for `http://127.0.0.1:4173`) and the users.
- Local Network Access specs serve the app under a fake public origin with `page.route()` (`local-network.spec.ts`) and grant `local-network-access` with `context.grantPermissions`. They run in Chromium only.
- XSS fixtures (hostile names, HTML, SVG, Markdown) must stay inert; add one when a new renderer lands.
- CORS: set rules per bucket with `PutBucketCors` (one bucket with a rule, one without); use Playwright route interception for `cors` versus `network` cases. Do not rely on a global CORS setting.
- `upload-large.spec.ts` (the 500 MB exit check) runs only with `COFFER_E2E_LARGE=1`. Other upload specs write sparse files to a temp directory and pass the path (`setInputFiles` refuses buffers over 50 MB).
- No fixed sleeps; wait on conditions. Tests must pass offline from the repo plus Docker.
