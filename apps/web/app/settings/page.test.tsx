import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "./page.js";

function renderWithQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

const EMPTY_CONFIG = { llmProviders: [], searchProviders: [] };

describe("SettingsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows existing LLM and search provider entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          llmProviders: [
            { id: "1", kind: "openai", label: "Work OpenAI", roles: ["chat", "embedding"], priority: 0, enabled: true, apiKeySet: true },
          ],
          searchProviders: [{ id: "2", kind: "tavily", label: "My Tavily", priority: 0, enabled: true, apiKeySet: true }],
        }),
      }),
    );
    renderWithQueryClient();
    expect(await screen.findByText("Work OpenAI")).toBeInTheDocument();
    expect(await screen.findByText("My Tavily")).toBeInTheDocument();
  });

  it("adds a new LLM provider with the entered API key", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url === "/api/config/llm") {
        return { ok: true, json: async () => ({ llmProviders: [{ id: "1", kind: "openai", roles: ["chat", "embedding"], priority: 0, enabled: true, apiKeySet: true }], searchProviders: [] }) };
      }
      return { ok: true, json: async () => EMPTY_CONFIG };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient();
    await screen.findByText(/llm providers/i);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-test-key");
    // Two "Add provider" buttons exist (LLM section, search section); the
    // first belongs to the LLM form this test is filling in.
    await user.click(screen.getAllByRole("button", { name: /add provider/i })[0]!);

    await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c: unknown[]) => c[0] === "/api/config/llm" && (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.apiKey).toBe("sk-test-key");
      expect(body.kind).toBe("openai");
    });
  });

  it("removes a provider when the trash icon is clicked", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return { ok: true, json: async () => EMPTY_CONFIG };
      return {
        ok: true,
        json: async () => ({
          llmProviders: [{ id: "abc", kind: "openai", label: "Work OpenAI", roles: ["chat"], priority: 0, enabled: true, apiKeySet: true }],
          searchProviders: [],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient();
    await screen.findByText("Work OpenAI");

    const user = userEvent.setup();
    await user.click(screen.getAllByLabelText(/remove provider/i)[0]!);

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/config/llm/abc", expect.objectContaining({ method: "DELETE" })),
    );
  });
});
