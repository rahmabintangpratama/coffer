import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App placeholder", () => {
  it("shows the app name from the copy file", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Coffer" })).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<App />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
