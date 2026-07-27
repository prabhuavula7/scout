import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

import { SidebarProvider } from "@/components/sidebar-context";
import { ThreadsView } from "./threads-view.js";

const RUNS = [
  { id: "1", slug: "stripe", connectorSlug: "custom", name: "Stripe", status: "ready", updatedAt: "" },
  { id: "2", slug: "hubspot", connectorSlug: "custom", name: "HubSpot", status: "ready", updatedAt: "" },
];

const THREADS = [
  {
    id: "multi-1",
    title: "Cross-platform sync",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    kind: "multi",
    platformSlugs: ["stripe", "hubspot"],
    platformNames: ["Stripe", "HubSpot"],
  },
  {
    id: "single-1",
    title: "Stripe questions",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    kind: "single",
    platformSlugs: ["stripe"],
    platformNames: ["Stripe"],
  },
];

function renderWithProviders() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <ThreadsView />
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

function fetchMockFor(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url === "/api/threads") return { ok: true, json: async () => THREADS };
    if (url === "/api/runs") return { ok: true, json: async () => RUNS };
    if (typeof url === "string" && url.includes("/messages")) {
      return { ok: true, json: async () => overrides.messages ?? [] };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("ThreadsView", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a flat thread list with platform badges for both single- and multi-run threads", async () => {
    vi.stubGlobal("fetch", fetchMockFor());
    renderWithProviders();

    const crossPlatform = await screen.findByText("Cross-platform sync");
    const row = crossPlatform.closest("div[role='button']") as HTMLElement;
    expect(within(row).getByText("Stripe")).toBeInTheDocument();
    expect(within(row).getByText("HubSpot")).toBeInTheDocument();

    expect(await screen.findByText("Stripe questions")).toBeInTheDocument();
  });

  it("defaults to the most recently updated thread when no thread is selected in the URL", async () => {
    vi.stubGlobal("fetch", fetchMockFor());
    renderWithProviders();

    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/threads?thread=multi-1"));
  });

  it("filters the list down to threads touching the selected platform", async () => {
    mockSearchParams = new URLSearchParams({ thread: "single-1" });
    vi.stubGlobal("fetch", fetchMockFor());
    renderWithProviders();

    await screen.findByText("Cross-platform sync");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox"), "hubspot");

    expect(screen.queryByText("Stripe questions")).not.toBeInTheDocument();
    expect(screen.getByText("Cross-platform sync")).toBeInTheDocument();
  });

  it("creates a multi-run thread when two or more platforms are checked in the new-thread panel", async () => {
    mockSearchParams = new URLSearchParams({ thread: "single-1" });
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/threads") return { ok: true, json: async () => THREADS };
      if (url === "/api/runs") return { ok: true, json: async () => RUNS };
      if (url === "/api/multi-threads" && init?.method === "POST") {
        return { ok: true, json: async () => ({ id: "new-multi", title: "New thread", platformSlugs: ["stripe", "hubspot"] }) };
      }
      if (typeof url === "string" && url.includes("/messages")) return { ok: true, json: async () => [] };
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders();

    await screen.findByText("Cross-platform sync");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /new thread/i }));
    await user.click(screen.getByRole("checkbox", { name: "Stripe" }));
    await user.click(screen.getByRole("checkbox", { name: "HubSpot" }));
    await user.click(screen.getByRole("button", { name: /create \(2 platforms\)/i }));

    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/threads?thread=new-multi"));
    const createCall = fetchMock.mock.calls.find((call: unknown[]) => call[0] === "/api/multi-threads");
    expect(JSON.parse((createCall![1] as RequestInit).body as string).platformSlugs.sort()).toEqual(["hubspot", "stripe"]);
  });
});
