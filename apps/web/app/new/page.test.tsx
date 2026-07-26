import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { SidebarProvider } from "@/components/sidebar-context";
import NewRunPage from "./page.js";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>{ui}</SidebarProvider>
    </QueryClientProvider>,
  );
}

describe("NewRunPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables submit until a spec source is entered", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    renderWithQueryClient(<NewRunPage />);

    const submit = screen.getByRole("button", { name: /start understanding/i });
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/openapi\.json/i), "https://api.example.com/openapi.json");
    expect(submit).toBeEnabled();
  });

  it("submits the form and redirects to the new run's page", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/connectors") return { ok: true, json: async () => [] };
      if (url === "/api/runs") return { ok: true, json: async () => ({ slug: "my-new-run" }) };
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(<NewRunPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/openapi\.json/i), "https://api.example.com/openapi.json");
    await user.click(screen.getByRole("button", { name: /start understanding/i }));

    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/platform/my-new-run/understanding"));

    const [, postCall] = fetchMock.mock.calls.find((call: unknown[]) => call[0] === "/api/runs")!;
    const sentBody = JSON.parse((postCall as RequestInit).body as string);
    expect(sentBody.source).toBe("https://api.example.com/openapi.json");
    expect(sentBody.kind).toBe("openapi_url");
  });

  it("switches to raw-spec mode and sends kind openapi_raw", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/connectors") return { ok: true, json: async () => [] };
      if (url === "/api/runs") return { ok: true, json: async () => ({ slug: "raw-run" }) };
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(<NewRunPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /paste raw spec/i }));
    await user.type(screen.getByPlaceholderText(/paste the openapi/i), "openapi: 3.0.0");
    await user.click(screen.getByRole("button", { name: /start understanding/i }));

    await vi.waitFor(() => expect(mockPush).toHaveBeenCalled());
    const [, postCall] = fetchMock.mock.calls.find((call: unknown[]) => call[0] === "/api/runs")!;
    const sentBody = JSON.parse((postCall as RequestInit).body as string);
    expect(sentBody.kind).toBe("openapi_raw");
  });
});
