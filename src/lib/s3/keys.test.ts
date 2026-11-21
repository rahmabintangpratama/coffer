import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./disposition";
import { decodeS3Key, fileKindOf, folderNameProblem, isHiddenName, keepBothKey, keyByteLength, keyProblem, MAX_KEY_BYTES, nameOf, trashPrefixOf } from "./keys";

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


describe("AC-40.4 key problems are found before upload", () => {
  it("accepts ordinary keys, Unicode and a key of exactly 1,024 bytes", () => {
    expect(keyProblem("a/b/日本語 (1).txt")).toBeNull();
    expect(keyProblem("x".repeat(MAX_KEY_BYTES))).toBeNull();
    expect(keyProblem("folder/")).toBeNull();
  });
  it("rejects too long, control characters, empty and dot segments, and lone surrogates", () => {
    expect(keyProblem("x".repeat(MAX_KEY_BYTES + 1))).toBe("tooLong");
    expect(keyProblem("日".repeat(342))).toBe("tooLong");
    expect(keyProblem("a\u0000b")).toBe("control");
    expect(keyProblem("a\nb")).toBe("control");
    expect(keyProblem("")).toBe("empty");
    expect(keyProblem("a//b")).toBe("empty");
    expect(keyProblem("/a")).toBe("empty");
    expect(keyProblem("a/../b")).toBe("dots");
    expect(keyProblem("a/./b")).toBe("dots");
    expect(keyProblem("a\ud800b")).toBe("surrogate");
  });
  it("AC-35.2 checks a new folder name", () => {
    expect(folderNameProblem("", "")).toBe("empty");
    expect(folderNameProblem("  ", "")).toBe("empty");
    expect(folderNameProblem("a/b", "")).toBe("slash");
    expect(folderNameProblem("..", "x/")).toBe("dots");
    expect(folderNameProblem("ok", "x/")).toBeNull();
    expect(folderNameProblem("x".repeat(1024), "")).toBe("tooLong");
  });
});

describe("AC-43.2 keep both names", () => {
  it("takes the first free number before the extension", () => {
    const taken = new Set(["d/a.txt", "d/a (1).txt", "d/a (2).txt"]);
    expect(keepBothKey("d/a.txt", (key) => taken.has(key))).toBe("d/a (3).txt");
    expect(keepBothKey("d/new.txt", (key) => taken.has(key))).toBe("d/new (1).txt");
  });
  it("uses the last extension, and the end of a dotfile name", () => {
    expect(keepBothKey("a.tar.gz", () => false)).toBe("a.tar (1).gz");
    expect(keepBothKey("d/.env", () => false)).toBe("d/.env (1)");
    expect(keepBothKey("README", (key) => key === "README (1)")).toBe("README (2)");
  });
});
