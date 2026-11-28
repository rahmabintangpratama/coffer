// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertLocalFixture, isTrashOf } from "../../tests/integration/cleanup";

// The test teardown deletes: it must refuse anything but a fixture on this machine, and take only a test's own trash.
describe("removing test data from the S3 fixture", () => {
  it("runs only against a server on this machine", () => {
    for (const local of ["http://127.0.0.1:9000", "http://localhost:9000", "http://[::1]:9000"]) expect(() => { assertLocalFixture(local); }, local).not.toThrow();
    for (const remote of ["https://s3.example-provider.test", "http://192.168.1.10:9000", "http://localhost.example.test", "http://127.0.0.1.example.test"]) {
      expect(() => { assertLocalFixture(remote); }, remote).toThrow("Refusing to delete test data");
    }
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
