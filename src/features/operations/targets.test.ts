import { describe, expect, it, vi } from "vitest";
import type { ConflictAnswer } from "@/features/transfers";
import { copyCandidate, decideTargets, stemLength, targetIn } from "./targets";

const never = (): Promise<ConflictAnswer> => Promise.reject(new Error("should not ask"));
const answer = (choice: ConflictAnswer["choice"], applyToAll = false) => () => Promise.resolve<ConflictAnswer>({ choice, applyToAll });
const existsIn = (...keys: string[]) => (key: string) => Promise.resolve(keys.includes(key));

describe("AC-33.1 and AC-33.3 copy names", () => {
  it("proposes name (copy).ext and then increments", () => {
    expect(copyCandidate("report.pdf", 1)).toBe("report (copy).pdf");
    expect(copyCandidate("report.pdf", 2)).toBe("report (copy 2).pdf");
    expect(copyCandidate("report.pdf", 10)).toBe("report (copy 10).pdf");
  });
  it("uses the last extension, and the end of a name with none or a leading dot", () => {
    expect(copyCandidate("a.tar.gz", 1)).toBe("a.tar (copy).gz");
    expect(copyCandidate("README", 1)).toBe("README (copy)");
    expect(copyCandidate(".env", 1)).toBe(".env (copy)");
  });
});

describe("FR-32 edge case: the extension stays out of the selection", () => {
  it("selects the stem only", () => {
    expect(stemLength("photo.jpg")).toBe(5);
    expect(stemLength("a.tar.gz")).toBe(5);
    expect(stemLength("README")).toBe(6);
    expect(stemLength(".env")).toBe(4);
  });
});

describe("targets", () => {
  it("puts an item in a folder, with the slash of a folder", () => {
    expect(targetIn("a/b/", { key: "x/f.txt", name: "f.txt", kind: "file" })).toBe("a/b/f.txt");
    expect(targetIn("", { key: "x/d/", name: "d", kind: "folder" })).toBe("d/");
  });
});

describe("AC-32.3 conflicts at the destination", () => {
  const moves = [
    { source: "s/a.txt", target: "d/a.txt" },
    { source: "s/b.txt", target: "d/b.txt" },
    { source: "s/c.txt", target: "d/c.txt" },
  ];

  it("passes everything through when nothing exists, without asking", async () => {
    expect(await decideTargets(moves, existsIn(), never)).toEqual(moves);
  });

  it("asks once per clash and says how many are left", async () => {
    const remaining: number[] = [];
    const result = await decideTargets(moves, existsIn("d/a.txt", "d/c.txt"), (question) => {
      remaining.push(question.remaining);
      return answer("skip")();
    });
    expect(remaining).toEqual([2, 1]);
    expect(result.map((move) => move.source)).toEqual(["s/b.txt"]);
  });

  it("Replace keeps the target, so the old object is overwritten", async () => {
    expect(await decideTargets(moves, existsIn("d/a.txt"), answer("replace"))).toEqual(moves);
  });

  it("Apply to all answers the rest without asking again", async () => {
    const ask = vi.fn(answer("replace", true));
    await decideTargets(moves, existsIn("d/a.txt", "d/b.txt", "d/c.txt"), ask);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("Keep both picks the first free name for an object", async () => {
    const result = await decideTargets([moves[0]!], existsIn("d/a.txt", "d/a (1).txt"), answer("keepBoth"));
    expect(result).toEqual([{ source: "s/a.txt", target: "d/a (2).txt" }]);
  });

  it("Keep both for a folder renames the folder and keeps its slash", async () => {
    const result = await decideTargets([{ source: "s/dir/", target: "d/dir/" }], existsIn("d/dir/"), answer("keepBoth"));
    expect(result).toEqual([{ source: "s/dir/", target: "d/dir (1)/" }]);
  });
});
