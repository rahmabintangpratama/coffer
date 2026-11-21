// @vitest-environment node
import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
import { listPage } from "./list";

const fakeClient = (handler: (input: Record<string, unknown>) => unknown) =>
  ({ send: vi.fn((command: { input: Record<string, unknown> }) => Promise.resolve().then(() => handler(command.input))) }) as unknown as S3Client;

describe("listPage (technical-spec 6.2, 6.3)", () => {
  it("asks for a delimiter, 1,000 keys and URL encoding, and decodes what comes back", async () => {
    const inputs: Record<string, unknown>[] = [];
    const client = fakeClient((input) => {
      inputs.push(input);
      return {
        CommonPrefixes: [{ Prefix: "dir+one/" }, { Prefix: ".trash/" }],
        Contents: [
          { Key: "x/", Size: 0 },
          { Key: "x/a+b%23.png", Size: 12, LastModified: new Date("2026-01-02T03:04:05Z"), ETag: '"abc"' },
        ],
        IsTruncated: true,
        NextContinuationToken: "t1",
      };
    });
    const page = await listPage(client, { bucket: "b", prefix: "x/", root: "" });
    expect(inputs[0]).toMatchObject({ Bucket: "b", Prefix: "x/", Delimiter: "/", MaxKeys: 1000, EncodingType: "url" });
    expect(page.folders.map((folder) => folder.key)).toEqual(["dir one/"]);
    expect(page.folders[0]?.name).toBe("dir one");
    expect(page.files).toEqual([
      { kind: "file", key: "x/a b#.png", name: "a b#.png", size: 12, lastModified: "2026-01-02T03:04:05.000Z", etag: "abc", contentType: "", fileKind: "image" },
    ]);
    expect(page.nextToken).toBe("t1");
    expect(page.count).toBe(2);
  });

  it("hides the trash prefix under a connection root", async () => {
    const client = fakeClient(() => ({ CommonPrefixes: [{ Prefix: "team/.trash/" }, { Prefix: "team/docs/" }] }));
    const page = await listPage(client, { bucket: "b", prefix: "team/", root: "team/" });
    expect(page.folders.map((folder) => folder.name)).toEqual(["docs"]);
  });

  it("passes the continuation token and reports no next token on the last page", async () => {
    const inputs: Record<string, unknown>[] = [];
    const client = fakeClient((input) => {
      inputs.push(input);
      return { IsTruncated: false, NextContinuationToken: "stale" };
    });
    const page = await listPage(client, { bucket: "b", prefix: "", root: "", token: "t9" });
    expect(inputs[0]).toMatchObject({ ContinuationToken: "t9" });
    expect(page.nextToken).toBeUndefined();
  });

  it("retries once without EncodingType when the provider rejects it, and remembers", async () => {
    const inputs: Record<string, unknown>[] = [];
    const client = fakeClient((input) => {
      inputs.push(input);
      if ("EncodingType" in input) throw Object.assign(new Error("x"), { name: "InvalidArgument", $metadata: { httpStatusCode: 400 } });
      return { Contents: [{ Key: "a+b.txt", Size: 1 }] };
    });
    const first = await listPage(client, { bucket: "b", prefix: "", root: "" });
    expect(first.files[0]?.key).toBe("a+b.txt");
    expect(inputs).toHaveLength(2);
    await listPage(client, { bucket: "b", prefix: "", root: "" });
    expect(inputs).toHaveLength(3);
    expect("EncodingType" in (inputs[2] ?? {})).toBe(false);
  });

  it("throws an AppError, never the SDK error", async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error("secret url"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
    });
    const error = await listPage(client, { bucket: "b", prefix: "", root: "" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("accessDenied");
  });
});
