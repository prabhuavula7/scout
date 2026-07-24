"use client";

import { use } from "react";
import { Compass } from "lucide-react";
import { EmptyState } from "@scout/ui";
import { useRun } from "@/lib/use-runs";
import { EndpointList } from "@/components/endpoint-list";

export default function ExplorerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: run, isLoading } = useRun(slug);

  if (isLoading) return <p className="text-sm text-stone-500">Loading endpoints…</p>;

  if (!run || run.endpoints.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="h-8 w-8" />}
        title="No endpoints yet"
        description="Import is still running, or the source didn't contain any operations."
      />
    );
  }

  return <EndpointList endpoints={run.endpoints} baseUrl={run.platform.baseUrl ?? ""} authScheme={run.platform.authScheme} />;
}
