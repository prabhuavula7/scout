// Must be set before React is imported anywhere: without it, React 19's
// `act()`/Suspense machinery doesn't know it's running under a test runner
// and silently stops flushing scheduled updates (e.g. a `use()` promise
// resolving never triggers a re-render), instead of the usual dev warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrollTo; the chat page calls it to auto-scroll
// on new messages.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom doesn't implement IntersectionObserver at all; the understanding
// page's table of contents uses it for scroll-spy highlighting. A no-op
// stub is enough for component tests that don't assert on scroll-driven
// active-section state.
if (typeof globalThis.IntersectionObserver === "undefined") {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = MockIntersectionObserver;
}
