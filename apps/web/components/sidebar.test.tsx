import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

import { Sidebar } from "./sidebar.js";

describe("Sidebar", () => {
  it("renders all three nav links", () => {
    mockUsePathname.mockReturnValue("/");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /runs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });

  it("marks the current route's link as active", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /settings/i })).toHaveClass("bg-stone-100");
    expect(screen.getByRole("link", { name: /^runs$/i })).not.toHaveClass("bg-stone-100");
  });
});
