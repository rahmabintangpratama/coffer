import { type BrowserContext, expect, type Page, test as base } from "@playwright/test";

/**
 * The `test` every spec uses. It adds one automatic guard (M10, C-31, NFR-2): in every test, in every page of every context
 * the test opens, there must be zero Content-Security-Policy violations and zero console errors or uncaught page errors. The
 * app runs under the real `_headers` (scripts/serve/dist-server.ts), so a violation here is a violation in production.
 *
 * The one thing let through without a word is the browser's own line for an HTTP error status from the S3 fixture
 * ("Failed to load resource: the server responded with a status of 404"): a HEAD for a key that does not exist, or the
 * connection test's probe of the endpoint root, is an answer the app expects and handles. A test that provokes a failure on
 * purpose (a CORS block, an offline endpoint) says so with `test.use({ expectedConsole: /pattern/ })`.
 */
interface GuardOptions {
  /**
   * Console messages this test causes on purpose, as one pattern (an array would be read by Playwright as a value-and-options
   * pair). Anything else that is an error still fails the test.
   */
  expectedConsole: RegExp | null;
}

const FIXTURE_PORT = ":9000/";
const EXPECTED_CONSOLE = "expected-console";

/**
 * The one message let through everywhere besides the fixture's status lines. A ResizeObserver callback that resizes what it
 * observes makes the browser say this once per frame; the HTML spec says it is not an error (nothing is lost, the rest is
 * delivered next frame), and the engines report it through window.onerror anyway (WebKit does, and Chromium can).
 */
const BENIGN = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

/**
 * What the three engines log when a request is blocked on purpose: a missing CORS rule, a loopback permission that was denied,
 * or a port the browser refuses. The wording differs per engine; the meaning does not.
 */
export const PROVOKED_NETWORK_FAILURE =
  /blocked by CORS policy|is not allowed by Access-Control-Allow-Origin|due to access control checks|Cross-Origin Request Blocked|restricted network port|Load failed|NetworkError when attempting to fetch resource|^Failed to load resource: (net::ERR_|Origin )/;

/**
 * Say, inside one test, that it causes this console message (or CSP report, written `<directive> <blocked uri>`) on purpose.
 * For a single test in a file that otherwise has none; `test.use({ expectedConsole })` is for a whole group.
 */
export function expectConsole(pattern: RegExp): void {
  test.info().annotations.push({ type: EXPECTED_CONSOLE, description: pattern.source });
}
const STATUS_LINE = /^Failed to load resource: the server responded with a status of \d{3}/;

/** The page-side recorder: every `securitypolicyviolation` is reported to the test as soon as it happens. */
const recordViolations = () => {
  document.addEventListener("securitypolicyviolation", (event) => {
    (window as unknown as { __cofferCsp: (report: string) => void }).__cofferCsp(`${event.violatedDirective} blocked ${event.blockedURI || "(inline)"}`);
  });
};

export const test = base.extend<GuardOptions & { guard: undefined }>({
  expectedConsole: [null, { option: true }],
  guard: [
    async ({ browser, expectedConsole }, use, testInfo) => {
      const problems: string[] = [];
      const attached = new WeakSet<Page>();
      // What the whole file allows (the option) and what the running test allows by calling `expectConsole`.
      const allowed = (text: string): boolean =>
        BENIGN.test(text) ||
        expectedConsole?.test(text) === true ||
        testInfo.annotations.some((note) => note.type === EXPECTED_CONSOLE && new RegExp(note.description ?? "(?!)").test(text));

      const attach = (page: Page) => {
        if (attached.has(page)) return;
        attached.add(page);
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          const text = message.text();
          if (STATUS_LINE.test(text) && message.location().url.includes(FIXTURE_PORT)) return;
          if (allowed(text)) return;
          problems.push(`console error: ${text}`);
        });
        page.on("pageerror", (error) => {
          if (allowed(error.message)) return;
          problems.push(`uncaught error: ${error.message}`);
        });
      };

      const instrument = async (context: BrowserContext) => {
        await context.exposeBinding("__cofferCsp", (_source, report: string) => { if (!allowed(report)) problems.push(`CSP violation: ${report}`); });
        await context.addInitScript(recordViolations);
        for (const page of context.pages()) attach(page);
        context.on("page", attach);
      };

      // Contexts a test opens itself (two tabs, a storage state) go through the same browser, so they are guarded too.
      const open = browser.newContext.bind(browser);
      browser.newContext = async (...args: Parameters<typeof open>) => {
        const context = await open(...args);
        await instrument(context);
        return context;
      };

      await use(undefined);
      browser.newContext = open;
      expect(problems, `${testInfo.title}: the page logged errors or broke the CSP`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
