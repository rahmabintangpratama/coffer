import { describe, expect, it } from "vitest";
import { THUMB_MAX_BYTES, wantsThumbnail } from "./thumbnails";

describe("M11 grid thumbnails", () => {
  it("only raster images within the size limit get one", () => {
    expect(wantsThumbnail({ name: "a.png", size: 10, fileKind: "image" })).toBe(true);
    expect(wantsThumbnail({ name: "a.JPEG", size: THUMB_MAX_BYTES, fileKind: "image" })).toBe(true);
    expect(wantsThumbnail({ name: "a.png", size: THUMB_MAX_BYTES + 1, fileKind: "image" })).toBe(false);
    expect(wantsThumbnail({ name: "a.png", size: 0, fileKind: "image" })).toBe(false);
    expect(wantsThumbnail({ name: "a.svg", size: 10, fileKind: "svg" })).toBe(false);
    expect(wantsThumbnail({ name: "a.heic", size: 10, fileKind: "image" })).toBe(false);
    expect(wantsThumbnail({ name: "a.txt", size: 10, fileKind: "code" })).toBe(false);
  });
});
