# tests/

Integration tests, end-to-end tests and shared fixtures. Unit and component tests sit next to the code (`*.test.ts[x]`). Rules from [../AGENTS.md](../AGENTS.md) apply; strategy is [technical-spec](../docs/technical-spec.md) section 15.

## Layout

- `integration/`: Vitest in Node against MinIO; `docker-compose.yml` is the fixture (fake credentials in `config.ts`). The official MinIO images are gone, so it runs the frozen `bitnamilegacy/minio` image; see OQ-32.
- `e2e/`: Playwright specs.
- `fixtures/`: fake credentials, hostile HTML, SVG and Markdown samples, sample files, provider payloads.

## Rules

- **Never use real cloud credentials.** Use the fixed fake MinIO keys from the compose file. A test that needs a real provider belongs in the manual compatibility matrix, not here.
- Name tests after the requirement: `AC-36.1 ...`. Group by FR.
- Integration: use a fresh bucket prefix per test; clean up in `afterEach`; inject faults through the S3 test middleware (crash after copy, after verify, mid-multipart, `SlowDown`, expired token).
- E2E viewport matrix: **375, 768 and 1440**, light and dark for visual and axe checks. Chromium for every spec; WebKit and Firefox for smoke and layout.
- Every e2e screen runs axe (serious and critical must be zero). Add keyboard-only flows for every FR with a keyboard path.
- E2E asserts no secret appears in the DOM, URL, storage dump or network log (other than signed provider requests).
- XSS fixtures (hostile names, HTML, SVG, Markdown) must stay inert; add one when a new renderer lands.
- CORS cases use Playwright route interception; MinIO runs with `MINIO_API_CORS_ALLOW_ORIGIN` for the happy path.
- No fixed sleeps; wait on conditions. Tests must pass offline from the repo plus Docker.
