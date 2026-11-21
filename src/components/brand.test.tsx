import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { CofferLogo } from "./CofferLogo";
import { CofferMark } from "./CofferMark";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe.each(["light", "dark"])("brand components in the %s theme", (theme) => {
  it("have no accessibility violations, named or decorative", async () => {
    document.documentElement.setAttribute("data-theme", theme);
    const { container } = render(
      <main>
        <CofferMark label="Coffer" />
        <CofferLogo label="Coffer logo" />
        <p>
          <CofferMark /> Coffer
        </p>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CofferMark", () => {
  it("is hidden from assistive tech unless it has a label", () => {
    const { container, rerender } = render(<CofferMark />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    rerender(<CofferMark label="Coffer" />);
    expect(screen.getByRole("img", { name: "Coffer" })).not.toHaveAttribute("aria-hidden");
  });

  it("draws no background and follows the theme through currentColor", () => {
    const { container } = render(<CofferMark size={12} />);
    expect(container.querySelector("rect")).toBeNull();
    const paths = [...container.querySelectorAll("path")];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveAttribute("fill", "currentColor");
    expect(container.querySelector("svg")).toHaveClass("text-accent", "size-12");
  });
});

describe("CofferLogo", () => {
  it("colors the mark with the accent and the wordmark with the text color", () => {
    const { container } = render(<CofferLogo label="Coffer" width={48} />);
    expect(container.querySelector("rect")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("text-accent", "w-48");
    const group = container.querySelector("g");
    expect(group).toHaveClass("text-fg");
    expect(group?.querySelectorAll("path")).toHaveLength(6);
    for (const path of container.querySelectorAll("path")) {
      expect(path.getAttribute("fill") ?? group?.getAttribute("fill")).toBe("currentColor");
    }
  });

  it("carries no hard-coded colors", () => {
    const { container } = render(<CofferLogo />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });
});
