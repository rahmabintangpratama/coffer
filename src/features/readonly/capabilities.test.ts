import { describe, expect, it } from "vitest";
import { canWrite, gateOf, writeGate } from "./capabilities";

// FR-111: one place decides what a read-only key may do.
describe("the capability helper", () => {
  it("a read-write connection may write and gates nothing", () => {
    expect(canWrite({ access: "readWrite" })).toBe(true);
    const gate = gateOf({ access: "readWrite" });
    expect(gate).toMatchObject({ readOnly: false, reason: undefined });
    expect(gate.action()).toEqual({ disabled: false });
    expect(gate.action(true)).toEqual({ disabled: true });
  });

  it("a read-only connection may not, and every gated action says why", () => {
    expect(canWrite({ access: "readOnly" })).toBe(false);
    const gate = gateOf({ access: "readOnly" });
    expect(gate).toMatchObject({ readOnly: true, reason: "This key is read-only" });
    expect(gate.action()).toEqual({ disabled: true, reason: "This key is read-only" });
    expect(gate.action(false)).toEqual({ disabled: true, reason: "This key is read-only" });
  });

  it("writeGate takes the flag the screens already hold", () => {
    expect(writeGate(true).reason).toBe("This key is read-only");
    expect(writeGate(false).reason).toBeUndefined();
  });
});
