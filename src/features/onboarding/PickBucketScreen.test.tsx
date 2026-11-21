import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { PickBucketScreen, VISIBLE_BUCKETS } from "./PickBucketScreen";

const noop = () => undefined;

describe("PickBucketScreen (O50)", () => {
  it("AC-7.1 lists the buckets with a search field and the scope sentence", async () => {
    const onPick = vi.fn();
    render(<PickBucketScreen buckets={["photos", "backups", "logs"]} onBack={noop} onPick={onPick} />);
    expect(screen.getByText("This key can access 3 buckets. A key limited to one bucket is safer.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Buckets" }).querySelectorAll("li")).toHaveLength(3);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search buckets" }), "log");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "logs" }));
    expect(onPick).toHaveBeenCalledWith("logs", false);
  });

  it("uses the singular for one bucket", () => {
    render(<PickBucketScreen buckets={["only"]} onBack={noop} onPick={noop} />);
    expect(screen.getByText(/^This key can access 1 bucket\./)).toBeInTheDocument();
  });

  it("says when the search matches nothing", async () => {
    render(<PickBucketScreen buckets={["a", "b"]} onBack={noop} onPick={noop} />);
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("No bucket matches your search.");
  });

  it("caps a long list and says how many more there are", () => {
    const buckets = Array.from({ length: VISIBLE_BUCKETS + 7 }, (_, index) => `bucket-${String(index).padStart(3, "0")}`);
    render(<PickBucketScreen buckets={buckets} onBack={noop} onPick={noop} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(VISIBLE_BUCKETS);
    expect(screen.getByText("and 7 more")).toBeInTheDocument();
  });

  it("AC-7.3 offers manual entry only when the key cannot list buckets", async () => {
    const onPick = vi.fn();
    render(<PickBucketScreen buckets={null} onBack={noop} onPick={onPick} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText(/can’t see any buckets/)).toBeInTheDocument();
    const open = screen.getByRole("button", { name: "Open bucket" });
    expect(open).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Bucket name" }), "  my-bucket ");
    await userEvent.click(open);
    expect(onPick).toHaveBeenCalledWith("my-bucket", true);
  });

  it("lets the person type a name instead of choosing from the list", async () => {
    const onPick = vi.fn();
    render(<PickBucketScreen buckets={["a"]} onBack={noop} onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "Type a bucket name instead" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Bucket name" }), "other{Enter}");
    expect(onPick).toHaveBeenCalledWith("other", true);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<PickBucketScreen buckets={["a", "b"]} onBack={noop} onPick={noop} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
