import { describe, expect, it } from "vitest";
import { formatBytes, formatModified } from "./format";

describe("formatBytes", () => {
  it("uses IEC units with one decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GiB");
  });
  it("returns nothing for a value that is not a size", () => {
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});

describe("formatModified", () => {
  it("is empty for a missing or bad date", () => {
    expect(formatModified("")).toBe("");
    expect(formatModified("nope")).toBe("");
  });
  it("shows a date for another day and a time for today", () => {
    const now = new Date("2026-06-15T12:00:00");
    expect(formatModified("2026-01-02T03:04:05", now)).toMatch(/2026/);
    expect(formatModified("2026-06-15T09:30:00", now)).not.toMatch(/2026/);
  });
});
