import { beforeEach, describe, expect, it } from "vitest";
import { useToasts } from "./toast";

beforeEach(() => {
  useToasts.setState({ toasts: [] });
});

describe("toast store", () => {
  it("adds toasts with increasing ids and removes one by id", () => {
    const first = useToasts.getState().push({ message: "One" });
    const second = useToasts.getState().push({ message: "Two", actionLabel: "Undo", onAction: () => undefined });
    expect(second).toBeGreaterThan(first);
    expect(useToasts.getState().toasts.map((toast) => toast.message)).toEqual(["One", "Two"]);

    useToasts.getState().dismiss(first);
    expect(useToasts.getState().toasts.map((toast) => toast.message)).toEqual(["Two"]);
  });
});
