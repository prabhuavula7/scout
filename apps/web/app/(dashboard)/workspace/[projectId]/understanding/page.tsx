"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";
import { EmptyState } from "@integration-scout/ui";
import { useApiClient } from "@/lib/use-api-client";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { MermaidDiagram } from "@/components/mermaid-diagram";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-stone-200 py-8 first:border-t-0 first:pt-0 dark:border-stone-800">
      <h3 className="font-serif text-lg font-medium text-stone-900 dark:text-stone-50">{title}</h3>
      <div className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
        {children}
      </div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function UnderstandingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const getApi = useApiClient();
  const platformId = useWorkspaceStore((s) => s.selectedPlatformByProject[projectId]);

  const { data: understanding, isLoading, error } = useQuery({
    queryKey: ["understanding", platformId],
    queryFn: async () => (await getApi()).getUnderstanding(platformId!),
    enabled: !!platformId,
    retry: false,
  });

  if (!platformId) {
    return (
      <EmptyState
        icon={<BrainCircuit className="h-8 w-8" />}
        title="No platform imported yet"
        description="Head to the Import tab to bring in a platform first."
      />
    );
  }

  if (isLoading) return <p className="text-sm text-stone-500">Loading analysis…</p>;

  if (error || !understanding) {
    return (
      <EmptyState
        icon={<BrainCircuit className="h-8 w-8" />}
        title="Not generated yet"
        description="The Understanding Agent runs automatically once import and doc crawling finish."
      />
    );
  }

  return (
    <div className="max-w-3xl">
      <Section title="Summary">
        <p className="font-serif text-base leading-relaxed text-stone-800 italic dark:text-stone-200">
          {understanding.summary}
        </p>
      </Section>
      <Section title="Architecture overview">
        <p>{understanding.architectureOverview}</p>
      </Section>
      <Section title="Authentication flow">
        <p>{understanding.authenticationFlow}</p>
      </Section>
      <Section title="Data model">
        <div className="space-y-3">
          {understanding.dataModel.map((entity) => (
            <div key={entity.entity} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
              <p className="font-medium">{entity.entity}</p>
              <p className="mt-1 text-xs text-stone-500">{entity.description}</p>
              <p className="mt-2 font-mono text-xs text-stone-500">{entity.keyFields.join(", ")}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Entity relationships">
        <MermaidDiagram chart={understanding.mermaidErDiagram} />
      </Section>
      <Section title="Common workflows">
        <div className="space-y-4">
          {understanding.commonWorkflows.map((workflow) => (
            <div key={workflow.name}>
              <p className="font-medium">{workflow.name}</p>
              <BulletList items={workflow.steps} />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Sequence diagram">
        <MermaidDiagram chart={understanding.mermaidSequenceDiagram} />
      </Section>
      <Section title="Integration opportunities">
        <BulletList items={understanding.integrationOpportunities} />
      </Section>
      <Section title="Potential pitfalls">
        <BulletList items={understanding.potentialPitfalls} />
      </Section>
      <Section title="Missing documentation">
        <BulletList items={understanding.missingDocumentation} />
      </Section>
      <Section title="Security observations">
        <BulletList items={understanding.securityObservations} />
      </Section>
    </div>
  );
}
