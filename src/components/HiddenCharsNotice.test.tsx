import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { HiddenCharsNotice } from "./HiddenCharsNotice";

const RLO = "\u202E";

describe("HiddenCharsNotice (S-10)", () => {
  it("renders nothing for plain names", () => {
    const { container } = render(<HiddenCharsNotice names={["report.pdf", "日本語.md", "שלום.txt"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("warns and draws the stored order with the code point visible", async () => {
    const { container } = render(<HiddenCharsNotice names={[`invoice${RLO}fdp.exe`, "ok.txt"]} />);
    expect(screen.getByText("This name has hidden characters")).toBeInTheDocument();
    const list = screen.getByTestId("hidden-names");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent("invoice⟨U+202E⟩fdp.exe");
    expect(list.textContent).not.toContain(RLO);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("counts names and caps the list", () => {
    const names = Array.from({ length: 7 }, (_, index) => `f${index.toString()}\u200B.txt`);
    render(<HiddenCharsNotice names={names} />);
    expect(screen.getByText("7 names have hidden characters")).toBeInTheDocument();
    expect(within(screen.getByTestId("hidden-names")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("and 2 more names")).toBeInTheDocument();
  });

  it("can leave the list to a screen that already shows the revealed text", () => {
    render(<HiddenCharsNotice names={["a\u200Bb"]} listed={false} />);
    expect(screen.getByText("This name has hidden characters")).toBeInTheDocument();
    expect(screen.queryByTestId("hidden-names")).toBeNull();
  });
});
