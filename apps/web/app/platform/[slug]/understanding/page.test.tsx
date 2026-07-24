import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UnderstandingPage from "./page.js";

const RUN_WITH_UNDERSTANDING = {
  platform: { id: "1", slug: "some-platform", connectorSlug: "custom", name: "Some Platform", status: "ready", updatedAt: "" },
  endpoints: [],
  understanding: {
    summary: "A test summary.",
    architectureOverview: "Overview.",
    authenticationFlow: "Auth flow.",
    dataModel: [],
    mermaidErDiagram: "erDiagram",
    commonWorkflows: [],
    mermaidSequenceDiagram: "sequenceDiagram",
    integrationOpportunities: [],
    potentialPitfalls: [],
    missingDocumentation: [],
    securityObservations: [],
  },
  resources: [],
  lastError: null,
};

async function renderWithQueryClient(slug: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <UnderstandingPage params={Promise.resolve({ slug })} />
        </Suspense>
      </QueryClientProvider>,
    );
  });
}

describe("UnderstandingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the empty state before an understanding has been generated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...RUN_WITH_UNDERSTANDING, understanding: null }),
      }),
    );
    await renderWithQueryClient("some-platform");
    expect(await screen.findByText(/not generated yet/i)).toBeInTheDocument();
  });

  it("renders the summary once an understanding exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RUN_WITH_UNDERSTANDING }));
    await renderWithQueryClient("some-platform");
    expect(await screen.findByText("A test summary.")).toBeInTheDocument();
  });

  it("finds related resources when the button is clicked and shows an error if it fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: false, json: async () => ({ error: "No search provider configured." }) };
      return { ok: true, json: async () => RUN_WITH_UNDERSTANDING };
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderWithQueryClient("some-platform");
    await screen.findByText("A test summary.");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /find related articles/i }));

    expect(await screen.findByText("No search provider configured.")).toBeInTheDocument();
  });
});
