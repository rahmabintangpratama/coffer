import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./disposition";
import { decodeS3Key, fileKindOf, isHiddenName, keyByteLength, nameOf, trashPrefixOf } from "./keys";

describe("key decoding (FR-20 edge cases)", () => {
  it("decodes percent escapes and + as a space", () => {
    expect(decodeS3Key("a+b%2Bc%23d%3Fe%25f")).toBe("a b+c#d?e%f");
  });

  it("decodes Unicode and emoji", () => {
    expect(decodeS3Key("%E6%97%A5%E6%9C%AC/%F0%9F%93%81+x/")).toBe("日本/📁 x/");
  });

  it("returns a value that is not valid encoding as it was", () => {
    expect(decodeS3Key("100%/done")).toBe("100%/done");
  });

  it("keeps leading and trailing spaces", () => {
    expect(decodeS3Key("+a+")).toBe(" a ");
  });
});

describe("names and kinds", () => {
  it("takes the last segment of a key or folder prefix", () => {
    expect(nameOf("a/b/c.txt")).toBe("c.txt");
    expect(nameOf("a/b/")).toBe("b");
    expect(nameOf("top")).toBe("top");
  });

  it("hides names that start with a dot", () => {
    expect(isHiddenName(".env")).toBe(true);
    expect(isHiddenName("a.env")).toBe(false);
  });

  it("builds the trash prefix under the root", () => {
    expect(trashPrefixOf("")).toBe(".trash/");
    expect(trashPrefixOf("team/")).toBe("team/.trash/");
  });

  it("knows kinds by extension, case-insensitively, and leaves dotfiles and bare names unknown", () => {
    expect(fileKindOf("Photo.JPG")).toBe("image");
    expect(fileKindOf("a.tar.gz")).toBe("archive");
    expect(fileKindOf("notes.md")).toBe("markdown");
    expect(fileKindOf("logo.svg")).toBe("svg");
    expect(fileKindOf(".png")).toBe("unknown");
    expect(fileKindOf("README")).toBe("unknown");
  });

  it("counts bytes, not characters", () => {
    expect(keyByteLength("日本")).toBe(6);
  });
});

describe("AC-37.1 download disposition (RFC 5987)", () => {
  it("encodes quotes, percent, non-ASCII and parameter breakers", () => {
    const value = attachmentDisposition('a "b"; x=y%.txt');
    expect(value).toBe(`attachment; filename="a _b_; x=y_.txt"; filename*=UTF-8''a%20%22b%22%3B%20x%3Dy%25.txt`);
    expect(attachmentDisposition("日本.txt")).toContain("filename*=UTF-8''%E6%97%A5%E6%9C%AC.txt");
    expect(attachmentDisposition("日本.txt")).toContain('filename="__.txt"');
  });

  it("encodes characters that encodeURIComponent leaves alone and that RFC 5987 does not allow", () => {
    expect(attachmentDisposition("it's (1)*.txt")).toContain("filename*=UTF-8''it%27s%20%281%29%2A.txt");
  });

  it("never lets a line break into the header", () => {
    expect(attachmentDisposition("a\r\nSet-Cookie: x")).not.toMatch(/[\r\n]/);
  });
});
