import { describe, expect, it } from "vitest";
import { isActiveRoute, routes } from "./routes";

describe("isActiveRoute", () => {
  it("matches Home only on the root", () => {
    expect(isActiveRoute(routes.home, "/")).toBe(true);
    expect(isActiveRoute(routes.home, "")).toBe(true);
    expect(isActiveRoute(routes.home, "/files")).toBe(false);
  });

  it("matches a route and its sub-paths but not a longer sibling", () => {
    expect(isActiveRoute(routes.files, "/files")).toBe(true);
    expect(isActiveRoute(routes.files, "/files/exports/2026")).toBe(true);
    expect(isActiveRoute(routes.files, "/filesystem")).toBe(false);
    expect(isActiveRoute(routes.trash, "/files")).toBe(false);
  });

  it("has one distinct path per route", () => {
    expect(new Set(Object.values(routes)).size).toBe(Object.keys(routes).length);
  });
});
