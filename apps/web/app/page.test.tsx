import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page.js";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no runs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    renderWithQueryClient(<HomePage />);
    expect(await screen.findByText(/no runs yet/i)).toBeInTheDocument();
  });

  it("lists runs with their status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "1", slug: "contentful", connectorSlug: "contentful", name: "Contentful", status: "ready", updatedAt: "" },
        ],
      }),
    );
    renderWithQueryClient(<HomePage />);
    expect(await screen.findByText("Contentful")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("asks for confirmation and then deletes the run when the trash icon is clicked", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return { ok: true, json: async () => ({ ok: true }) };
      return {
        ok: true,
        json: async () => [
          { id: "1", slug: "contentful", connectorSlug: "contentful", name: "Contentful", status: "ready", updatedAt: "" },
        ],
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(<HomePage />);
    await screen.findByText("Contentful");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/delete run/i));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/runs/contentful", expect.objectContaining({ method: "DELETE" })),
    );
  });

  it("does not delete when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "1", slug: "contentful", connectorSlug: "contentful", name: "Contentful", status: "ready", updatedAt: "" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(<HomePage />);
    await screen.findByText("Contentful");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/delete run/i));

    expect(fetchMock).not.toHaveBeenCalledWith("/api/runs/contentful", expect.objectContaining({ method: "DELETE" }));
  });
});
