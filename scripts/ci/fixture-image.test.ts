// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The S3 fixture image is pinned by digest in two places. They must stay the
// same, and each must keep the readable tag as a comment.
const IMAGE = /^\s*image:\s*(rustfs\/rustfs@sha256:[0-9a-f]{64})\s+#\s*(\d+\.\d+\.\d+)\s*$/m;

const read = (path: string) => readFileSync(path, "utf8");

describe("S3 fixture image pin", () => {
  const compose = IMAGE.exec(read("tests/integration/docker-compose.yml"));
  const workflow = IMAGE.exec(read(".github/workflows/ci.yml"));

  it("is pinned by a full sha256 digest with the tag as a comment, in both files", () => {
    expect(compose, "docker-compose.yml").not.toBeNull();
    expect(workflow, "ci.yml").not.toBeNull();
  });

  it("is the same image and tag in docker-compose.yml and the CI service", () => {
    expect(workflow?.[1]).toBe(compose?.[1]);
    expect(workflow?.[2]).toBe(compose?.[2]);
  });
});
