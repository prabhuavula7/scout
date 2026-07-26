import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

import { Sidebar } from "./sidebar.js";
import { SidebarProvider } from "./sidebar-context.js";

function renderSidebar() {
  return render(
    <SidebarProvider>
      <Sidebar />
    </SidebarProvider>,
  );
}

describe("Sidebar", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("renders all four nav links", () => {
    mockUsePathname.mockReturnValue("/");
    renderSidebar();
    expect(screen.getByRole("link", { name: /runs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /threads/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });

  it("marks the current route's link as active", () => {
    mockUsePathname.mockReturnValue("/settings");
    renderSidebar();
    expect(screen.getByRole("link", { name: /settings/i })).toHaveClass("bg-stone-100");
    expect(screen.getByRole("link", { name: /^runs$/i })).not.toHaveClass("bg-stone-100");
  });

  it("collapses to icon-only nav on toggle, and expands back", async () => {
    mockUsePathname.mockReturnValue("/");
    renderSidebar();
    const user = userEvent.setup();

    expect(screen.getByRole("link", { name: /runs/i })).toHaveTextContent("Runs");

    await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(screen.getByRole("link", { name: /runs/i })).toHaveTextContent("");

    await user.click(screen.getByRole("button", { name: /expand sidebar/i }));
    expect(screen.getByRole("link", { name: /runs/i })).toHaveTextContent("Runs");
  });
});
