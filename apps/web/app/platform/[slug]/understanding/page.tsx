"use client";

import { use } from "react";
import { BrainCircuit, Search } from "lucide-react";
import { EmptyState } from "@scout/ui";
import { useRun, useRunResearch } from "@/lib/use-runs";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { TableOfContents } from "@/components/table-of-contents";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-stone-200 py-8 first:border-t-0 first:pt-0 dark:border-stone-800">
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

const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "architecture-overview", label: "Architecture overview" },
  { id: "authentication-flow", label: "Authentication flow" },
  { id: "data-model", label: "Data model" },
  { id: "entity-relationships", label: "Entity relationships" },
  { id: "common-workflows", label: "Common workflows" },
  { id: "sequence-diagram", label: "Sequence diagram" },
  { id: "integration-opportunities", label: "Integration opportunities" },
  { id: "potential-pitfalls", label: "Potential pitfalls" },
  { id: "missing-documentation", label: "Missing documentation" },
  { id: "security-observations", label: "Security observations" },
  { id: "further-reading", label: "Further reading" },
] as const;

export default function UnderstandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: run, isLoading } = useRun(slug);
  const research = useRunResearch(slug);
  const understanding = run?.understanding;
  const resources = run?.resources ?? [];

  if (isLoading) return <p className="text-sm text-stone-500">Loading analysis…</p>;

  if (!understanding) {
    return (
      <EmptyState
        icon={<BrainCircuit className="h-8 w-8" />}
        title="Not generated yet"
        description="Understanding is produced automatically once scout understand finishes."
      />
    );
  }

  return (
    <div className="flex items-start gap-10">
      <div className="min-w-0 max-w-3xl flex-1">
        <Section id="summary" title="Summary">
          <p className="font-serif text-base leading-relaxed text-stone-800 italic dark:text-stone-200">
            {understanding.summary}
          </p>
        </Section>
        <Section id="architecture-overview" title="Architecture overview">
          <p>{understanding.architectureOverview}</p>
        </Section>
        <Section id="authentication-flow" title="Authentication flow">
          <p>{understanding.authenticationFlow}</p>
        </Section>
        <Section id="data-model" title="Data model">
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
        <Section id="entity-relationships" title="Entity relationships">
          <MermaidDiagram chart={understanding.mermaidErDiagram} />
        </Section>
        <Section id="common-workflows" title="Common workflows">
          <div className="space-y-4">
            {understanding.commonWorkflows.map((workflow) => (
              <div key={workflow.name}>
                <p className="font-medium">{workflow.name}</p>
                <BulletList items={workflow.steps} />
              </div>
            ))}
          </div>
        </Section>
        <Section id="sequence-diagram" title="Sequence diagram">
          <MermaidDiagram chart={understanding.mermaidSequenceDiagram} />
        </Section>
        <Section id="integration-opportunities" title="Integration opportunities">
          <BulletList items={understanding.integrationOpportunities} />
        </Section>
        <Section id="potential-pitfalls" title="Potential pitfalls">
          <BulletList items={understanding.potentialPitfalls} />
        </Section>
        <Section id="missing-documentation" title="Missing documentation">
          <BulletList items={understanding.missingDocumentation} />
        </Section>
        <Section id="security-observations" title="Security observations">
          <BulletList items={understanding.securityObservations} />
        </Section>
        <Section id="further-reading" title="Further reading">
          <button
            type="button"
            onClick={() => research.mutate()}
            disabled={research.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
          >
            <Search className="h-3 w-3" strokeWidth={2} />
            {research.isPending
              ? "Searching…"
              : resources.length > 0
                ? "Find more resources"
                : "Find related articles and tutorials"}
          </button>
          {research.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{(research.error as Error).message}</p>
          )}
          {resources.length > 0 && (
            <ul className="mt-3 space-y-2">
              {resources.map((resource) => (
                <li key={resource.url}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2 hover:no-underline"
                  >
                    {resource.title}
                  </a>
                  <p className="text-xs text-stone-500">{resource.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <TableOfContents items={SECTIONS.map((s) => ({ id: s.id, label: s.label }))} />
    </div>
  );
}
