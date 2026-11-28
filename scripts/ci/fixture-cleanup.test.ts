// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertTestFixture, isTrashOf } from "../../tests/integration/cleanup";

// The test teardown deletes: it must refuse anything but a fixture on this machine, and take only a test's own trash.
describe("removing test data from the S3 fixture", () => {
  it("runs only against a server on this machine", () => {
    for (const local of ["http://127.0.0.1:9000", "http://localhost:9000", "http://[::1]:9000"]) expect(() => { assertTestFixture(local); }, local).not.toThrow();
    for (const remote of ["https://s3.example-provider.test", "http://192.168.1.10:9000", "http://localhost.example.test", "http://127.0.0.1.example.test"]) {
      expect(() => { assertTestFixture(remote); }, remote).toThrow("Refusing to delete test data");
    }
  });

  it("runs only with the access key the compose file starts the fixture with", () => {
    const local = "http://127.0.0.1:9000";
    expect(() => { assertTestFixture(local, "coffer-test-key"); }).not.toThrow();
    expect(() => { assertTestFixture(local); }).not.toThrow();
    for (const key of ["someone-else-example-key", "coffer-readonly-key", "coffer-test-key-2", ""]) {
      expect(() => { assertTestFixture(local, key); }, key).toThrow("not the fixture key in tests/integration/docker-compose.yml");
    }
  });

  it("does not print the configured key when it refuses", () => {
    let message = "";
    try {
      assertTestFixture("http://127.0.0.1:9000", "someone-else-example-key");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("Refusing to delete test data");
    expect(message).not.toContain("someone-else-example-key");
  });

  it("takes the trash of a test folder, and of a connection rooted in it, and nothing else", () => {
    const own = "e2e-ops/abc-1234";
    expect(isTrashOf(`.coffer-trash/20261122T090503Z-aaaaaa/${own}/a.txt`, own)).toBe(true);
    expect(isTrashOf(`${own}/.coffer-trash/20261122T090503Z-aaaaaa/${own}/a.txt`, own)).toBe(true);
    expect(isTrashOf(`.coffer-trash/20261122T090503Z-aaaaaa/${own}5/a.txt`, own)).toBe(false);
    expect(isTrashOf(".coffer-trash/20261122T090503Z-aaaaaa/e2e-ops/other/a.txt", own)).toBe(false);
    expect(isTrashOf(`${own}/a.txt`, own)).toBe(false);
  });
});
