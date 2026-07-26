import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/sidebar-context";
import ChatPage from "./page.js";

async function renderWithQueryClient(slug: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The page reads its slug via React 19's `use(params)`; Next.js's own
  // runtime resolves that before hydration, but a bare render() in RTL
  // needs an explicit act(async) flush the first time, or the Suspense
  // fallback never gets past "loading" (see debugging notes in git history
  // of this file if this regresses again).
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <Suspense fallback={null}>
            <ChatPage params={Promise.resolve({ slug })} />
          </Suspense>
        </SidebarProvider>
      </QueryClientProvider>,
    );
  });
}

describe("ChatPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the empty state when there's no chat history yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    await renderWithQueryClient("some-platform");
    expect(await screen.findByText(/ask about this platform/i)).toBeInTheDocument();
  });

  it("shows the real error message inline when sending a message fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: false, json: async () => ({ error: "Invalid API key" }) };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderWithQueryClient("misconfigured-platform");
    await screen.findByText(/ask about this platform/i);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/ask a question/i), "How does auth work?");
    await user.click(screen.getByRole("button"));

    expect(await screen.findByText("Invalid API key")).toBeInTheDocument();
  });
});
