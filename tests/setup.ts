import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";
import { afterEach, beforeAll, expect } from "vitest";
import { lazyCopyGroups, loadCopyGroups } from "../src/lib/i18n";

expect.extend(toHaveNoViolations);

// Tests may render any screen, so load every copy group up front. The loading
// behavior itself is tested in src/lib/i18n/index.test.ts.
beforeAll(async () => {
  await loadCopyGroups(...lazyCopyGroups());
});

// jsdom has no showModal/close on <dialog>. This stand-in keeps the open
// attribute and the close event, which is what the components rely on.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(() => {
  cleanup();
});
