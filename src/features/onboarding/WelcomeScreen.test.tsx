import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { providersFile } from "@/lib/providers";
import { providerCountClaim, WelcomeScreen } from "./WelcomeScreen";

describe("WelcomeScreen (O10)", () => {
  it("AC-1.1 shows the headline, three facts and Connect a bucket, and no sample-files button in the MVP", async () => {
    const onConnect = vi.fn();
    render(<WelcomeScreen onConnect={onConnect} />);
    expect(screen.getByRole("heading", { level: 1, name: "Manage your bucket files the way you already manage files" })).toBeInTheDocument();
    const facts = screen.getByRole("list", { name: "What Coffer does" });
    expect(facts.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("Your keys stay in this browser")).toBeInTheDocument();
    expect(screen.getByText("Free and open source")).toBeInTheDocument();
    expect(screen.getByText(/^Works with \d+\+ S3-compatible providers$/)).toBeInTheDocument();
    expect(screen.queryByText("Explore with sample files")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Connect a bucket" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("rounds the provider count down to a ten so the claim stays true", () => {
    expect(providerCountClaim(21)).toBe(20);
    expect(providerCountClaim(30)).toBe(30);
    expect(providerCountClaim(9)).toBe(0);
  });

  it("D-40 the build-time provider count is the real number of presets", () => {
    expect(__PROVIDER_COUNT__).toBe(providersFile.providers.length);
  });

  it("shows the logo with its name and has no accessibility violations", async () => {
    const { container } = render(<WelcomeScreen onConnect={() => undefined} />);
    expect(screen.getByRole("img", { name: "Coffer" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
