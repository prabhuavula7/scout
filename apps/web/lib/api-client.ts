import type {
  ChatMessage,
  CreateProjectRequest,
  Endpoint,
  ImportRequest,
  Platform,
  PlatformUnderstanding,
  Project,
} from "@integration-scout/types";
import type { ConnectorDefinition } from "@integration-scout/connectors";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error ?? "Request failed");
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export function createApiClient(token: string | null) {
  return {
    listConnectors: () => request<ConnectorDefinition[]>("/connectors", undefined, token),

    listProjects: () => request<Project[]>("/projects", undefined, token),
    createProject: (body: CreateProjectRequest) =>
      request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }, token),
    getProject: (id: string) => request<Project>(`/projects/${id}`, undefined, token),
    toggleFavorite: (id: string, isFavorite: boolean) =>
      request<Project>(
        `/projects/${id}/favorite`,
        { method: "PATCH", body: JSON.stringify({ isFavorite }) },
        token,
      ),

    listPlatforms: (projectId: string) =>
      request<Platform[]>(`/projects/${projectId}/platforms`, undefined, token),
    importPlatform: (
      projectId: string,
      body: Omit<ImportRequest, "projectId"> & { docUrls?: string[] },
    ) =>
      request<Platform>(
        `/projects/${projectId}/platforms/import`,
        { method: "POST", body: JSON.stringify(body) },
        token,
      ),
    getPlatform: (id: string) => request<Platform>(`/platforms/${id}`, undefined, token),
    listEndpoints: (platformId: string) =>
      request<Endpoint[]>(`/platforms/${platformId}/endpoints`, undefined, token),

    getUnderstanding: (platformId: string) =>
      request<PlatformUnderstanding>(`/platforms/${platformId}/understanding`, undefined, token),

    listChatMessages: (platformId: string) =>
      request<ChatMessage[]>(`/platforms/${platformId}/chat/messages`, undefined, token),
    sendChatMessage: (
      platformId: string,
      message: string,
      history: Array<{ role: "user" | "assistant"; content: string }>,
    ) =>
      request<ChatMessage>(
        "/chat",
        { method: "POST", body: JSON.stringify({ platformId, message, history }) },
        token,
      ),
  };
}

export { ApiError };
