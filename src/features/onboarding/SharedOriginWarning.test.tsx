import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { SharedOriginWarning } from "./SharedOriginWarning";

const at = (hostname: string, pathname: string) => ({ hostname, pathname });

describe("FR-1 AC-1.4 the shared-origin warning", () => {
  it("says what other sites can do and links to the deploy guide, with no way to dismiss it", async () => {
    const { container } = render(<SharedOriginWarning base="/coffer/" address={at("files.example.com", "/coffer/")} />);
    expect(screen.getByRole("status")).toHaveTextContent("Other sites on this address can read the encrypted data Coffer saves in this browser");
    const link = screen.getByRole("link", { name: "How to give Coffer its own address" });
    expect(link.getAttribute("href")).toMatch(/\/docs\/deploy\/README\.md#serving-under-a-path$/);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is absent at the root of an origin", () => {
    const { container } = render(<SharedOriginWarning base="/" address={at("coffer.pages.dev", "/")} />);
    expect(container).toBeEmptyDOMElement();
  });
});
