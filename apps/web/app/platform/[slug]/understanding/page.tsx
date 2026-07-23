"use client";

import { use } from "react";
import { BrainCircuit } from "lucide-react";
import { EmptyState } from "@scout/ui";
import { useRun } from "@/lib/use-runs";
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

export default function UnderstandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: run, isLoading } = useRun(slug);
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
      {resources.length > 0 && (
        <Section title="Further reading">
          <ul className="space-y-2">
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
        </Section>
      )}
    </div>
  );
}
