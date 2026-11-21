import { describe, expect, it, vi } from "vitest";
import type { PlannedUpload } from "./plan";
import { planUploads } from "./plan";
import { resolveConflicts, type ConflictAnswer } from "./resolve";

const item = (key: string): PlannedUpload => ({ key, name: key.slice(key.lastIndexOf("/") + 1), file: { size: 1, type: "", slice: () => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) }) } });
const none = () => Promise.resolve(new Set<string>());
const keys = (items: PlannedUpload[]) => items.map((entry) => entry.key);

describe("FR-43 conflicts", () => {
  it("passes everything through when nothing exists", async () => {
    const ask = vi.fn();
    expect(keys(await resolveConflicts([item("d/a"), item("d/b")], new Set(), ask, none))).toEqual(["d/a", "d/b"]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("AC-43.1 asks once per conflict and reports how many are left", async () => {
    const asked: number[] = [];
    const ask = (question: { remaining: number }): Promise<ConflictAnswer> => { asked.push(question.remaining); return Promise.resolve({ choice: "skip", applyToAll: false }); };
    const result = await resolveConflicts([item("d/a"), item("d/new"), item("d/b")], new Set(["d/a", "d/b"]), ask, none);
    expect(asked).toEqual([2, 1]);
    expect(keys(result)).toEqual(["d/new"]);
  });

  it("AC-43.1 Apply to all answers the rest without asking again", async () => {
    const ask = vi.fn(() => Promise.resolve<ConflictAnswer>({ choice: "replace", applyToAll: true }));
    const result = await resolveConflicts([item("d/a"), item("d/b"), item("d/c")], new Set(["d/a", "d/b", "d/c"]), ask, none);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(keys(result)).toEqual(["d/a", "d/b", "d/c"]);
  });

  it("AC-43.2 Keep both uses the first free number, checking the bucket for the candidate", async () => {
    // d/a (1).txt exists in the bucket but was not in the listing the first check saw.
    const existsInBucket = (candidates: string[]) => Promise.resolve(new Set(candidates.filter((key) => key === "d/a (1).txt")));
    const ask = () => Promise.resolve<ConflictAnswer>({ choice: "keepBoth", applyToAll: false });
    const result = await resolveConflicts([item("d/a.txt")], new Set(["d/a.txt"]), ask, existsInBucket);
    expect(keys(result)).toEqual(["d/a (2).txt"]);
  });

  it("AC-43.3 Replace keeps the key, so the old object is overwritten only when the upload completes", async () => {
    const ask = () => Promise.resolve<ConflictAnswer>({ choice: "replace", applyToAll: false });
    expect(keys(await resolveConflicts([item("d/a")], new Set(["d/a"]), ask, none))).toEqual(["d/a"]);
  });

  it("edge: a name repeated inside one batch is a conflict, and Keep both gives distinct keys", async () => {
    const ask = () => Promise.resolve<ConflictAnswer>({ choice: "keepBoth", applyToAll: true });
    const result = await resolveConflicts([item("d/a.txt"), item("d/a.txt"), item("d/a.txt")], new Set(), ask, none);
    expect(keys(result)).toEqual(["d/a.txt", "d/a (1).txt", "d/a (2).txt"]);
  });
});

describe("AC-40.1 and AC-40.4 planning", () => {
  const file = (name: string, path = ""): { file: File; path: string } => ({ file: new File(["x"], name), path: path || name });

  it("puts a file in the folder and a folder upload keeps its relative paths", () => {
    const { planned } = planUploads("docs/", [file("a.txt"), file("c.txt", "pics/2026/c.txt")]);
    expect(planned.map((entry) => entry.key)).toEqual(["docs/a.txt", "docs/pics/2026/c.txt"]);
    expect(planned.map((entry) => entry.name)).toEqual(["a.txt", "c.txt"]);
  });

  it("reports names the bucket cannot store before anything uploads", () => {
    const { planned, rejected } = planUploads("", [file("ok.txt"), file("bad.txt", `x${"y".repeat(1100)}`), file("ctrl", "a\u0001b")]);
    expect(planned.map((entry) => entry.key)).toEqual(["ok.txt"]);
    expect(rejected.map((entry) => entry.problem)).toEqual(["tooLong", "control"]);
  });

  it("edge: a zero-byte file is planned", () => {
    expect(planUploads("", [{ file: new File([], "empty"), path: "empty" }]).planned).toHaveLength(1);
  });
});
