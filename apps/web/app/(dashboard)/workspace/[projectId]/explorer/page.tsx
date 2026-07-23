"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { EmptyState } from "@integration-scout/ui";
import { useApiClient } from "@/lib/use-api-client";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { EndpointList } from "@/components/endpoint-list";

export default function ExplorerPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const getApi = useApiClient();
  const platformId = useWorkspaceStore((s) => s.selectedPlatformByProject[projectId]);

  const { data: platform } = useQuery({
    queryKey: ["platform", platformId],
    queryFn: async () => (await getApi()).getPlatform(platformId!),
    enabled: !!platformId,
  });

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ["endpoints", platformId],
    queryFn: async () => (await getApi()).listEndpoints(platformId!),
    enabled: !!platformId,
  });

  if (!platformId) {
    return (
      <EmptyState
        icon={<Compass className="h-8 w-8" />}
        title="No platform imported yet"
        description="Head to the Import tab to bring in an OpenAPI spec."
      />
    );
  }

  if (isLoading) return <p className="text-sm text-stone-500">Loading endpoints…</p>;

  if (!endpoints || endpoints.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="h-8 w-8" />}
        title="No endpoints yet"
        description="Import is still running, or the source didn't contain any operations."
      />
    );
  }

  return <EndpointList endpoints={endpoints} baseUrl={platform?.baseUrl ?? ""} />;
}
