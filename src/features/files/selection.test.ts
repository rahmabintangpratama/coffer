import { beforeEach, describe, expect, it } from "vitest";
import { useSelection } from "./selection";

const order = ["a", "b", "c", "d", "e"];
const keys = () => [...useSelection.getState().keys];

describe("FR-30 selection model", () => {
  beforeEach(() => { useSelection.getState().clear(); });

  it("AC-30.1 selects one, toggles, and ranges from the anchor", () => {
    const s = useSelection.getState();
    s.set("b");
    expect(keys()).toEqual(["b"]);
    s.toggle("d");
    expect(keys()).toEqual(["b", "d"]);
    s.set("b");
    s.range("e", order);
    expect(keys()).toEqual(["b", "c", "d", "e"]);
    s.range("a", order);
    expect(keys()).toEqual(["a", "b"]);
  });

  it("AC-30.1 selects all loaded items", () => {
    useSelection.getState().selectAll(order);
    expect(keys()).toEqual(order);
  });

  it("AC-30.2 leaves selection mode when the last item is toggled off", () => {
    const s = useSelection.getState();
    s.set("a");
    expect(useSelection.getState().active).toBe(true);
    s.toggle("a");
    expect(useSelection.getState().active).toBe(false);
  });

  it("AC-30.4 clears", () => {
    useSelection.getState().selectAll(order);
    useSelection.getState().clear();
    expect(keys()).toEqual([]);
  });

  it("a range from an anchor that is gone falls back to a single selection", () => {
    const s = useSelection.getState();
    s.set("zzz");
    s.range("c", order);
    expect(keys()).toEqual(["c"]);
  });
});
