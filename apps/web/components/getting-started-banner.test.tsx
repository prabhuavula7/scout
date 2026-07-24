import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GettingStartedBanner } from "./getting-started-banner.js";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("GettingStartedBanner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a setup prompt when no LLM provider is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ llmProviders: [], searchProviders: [] }) }),
    );
    renderWithQueryClient(<GettingStartedBanner />);
    expect(await screen.findByText(/add an llm provider before your first run/i)).toBeInTheDocument();
  });

  it("renders nothing once at least one LLM provider is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        llmProviders: [{ id: "1", kind: "openai", roles: ["chat", "embedding"], priority: 0, enabled: true, apiKeySet: true }],
        searchProviders: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderWithQueryClient(<GettingStartedBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
