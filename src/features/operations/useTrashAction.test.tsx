import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSummary } from "@/lib/types";
import { startTrash } from "./run";
import { useTrashAction } from "./useTrashAction";

vi.mock("./run", () => ({ startTrash: vi.fn() }));

const connection = { id: "c1", endpoint: "http://x", bucket: "b" } as unknown as ConnectionSummary;
const hooks = { notify: vi.fn(), onChanged: vi.fn() };
const items = [{ key: "a.txt", name: "a.txt", kind: "file" as const }];

function Harness({ confirm }: { confirm: boolean }) {
  const { trash, dialog } = useTrashAction({ connection, root: "", hooks, confirm });
  return (
    <>
      <button onClick={() => { trash(items); }}>go</button>
      {dialog}
    </>
  );
}

afterEach(() => { vi.clearAllMocks(); });

describe("FR-36 move to trash", () => {
  it("AC-36.1 runs at once, with no question, by default", async () => {
    render(<Harness confirm={false} />);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(startTrash).toHaveBeenCalledWith({ connection, root: "", keys: ["a.txt"] }, hooks);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AC-36.2 asks first when confirmTrash is on, and Cancel trashes nothing", async () => {
    render(<Harness confirm />);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(startTrash).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Move to trash?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(startTrash).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    await userEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    expect(startTrash).toHaveBeenCalledTimes(1);
  });
});
