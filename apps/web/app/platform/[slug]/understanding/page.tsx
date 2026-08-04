"use client";

import { use, useRef, useState } from "react";
import { BrainCircuit, Clipboard, ClipboardCheck, Code2, FileUp, Link2, Search, Trash2 } from "lucide-react";
import { EmptyState } from "@scout/ui";
import {
  useAttachFile,
  useAttachLink,
  useChatThreads,
  useDocSources,
  useGenerateCode,
  useHandoff,
  useRemoveDocSource,
  useRun,
  useRunResearch,
} from "@/lib/use-runs";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { EntityDiagramCanvas } from "@/components/entity-diagram-canvas";
import { TableOfContents } from "@/components/table-of-contents";
import { PipelineProgress } from "@/components/pipeline-progress";

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
  { id: "starter-code", label: "Starter code" },
  { id: "ide-handoff", label: "IDE handoff" },
  { id: "sequence-diagram", label: "Sequence diagram" },
  { id: "integration-opportunities", label: "Integration opportunities" },
  { id: "potential-pitfalls", label: "Potential pitfalls" },
  { id: "missing-documentation", label: "Missing documentation" },
  { id: "security-observations", label: "Security observations" },
  { id: "attached-documents", label: "Attached documents" },
  { id: "further-reading", label: "Further reading" },
] as const;

export default function UnderstandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: run, isLoading } = useRun(slug);
  const research = useRunResearch(slug);
  const generate = useGenerateCode(slug);
  const handoff = useHandoff(slug);
  const { data: threads } = useChatThreads(slug);
  const { data: docSources } = useDocSources(slug);
  const attachFile = useAttachFile(slug);
  const attachLink = useAttachLink(slug);
  const removeDocSource = useRemoveDocSource(slug);
  const [lang, setLang] = useState<"ts" | "py">("ts");
  const [copied, setCopied] = useState(false);
  const [handoffThreadId, setHandoffThreadId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachedDocs = (Array.isArray(docSources) ? docSources : []).filter(
    (s) => s.origin === "upload" || s.origin === "link",
  );
  const understanding = run?.understanding;
  const resources = run?.resources ?? [];

  if (isLoading) return <p className="text-sm text-stone-500">Loading analysis…</p>;

  const status = run?.platform.status;
  if (status && status !== "ready" && status !== "failed") {
    return <PipelineProgress status={status} />;
  }

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
          <EntityDiagramCanvas
            dataModel={understanding.dataModel}
            entityRelationships={understanding.entityRelationships}
          />
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
        <Section id="starter-code" title="Starter code">
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
              {(["ts", "py"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    // Switching languages without this leaves the previously-generated
                    // code on screen with a caption now describing the *new* lang
                    // selection (e.g. TS code shown under a "python3 -m py_compile"
                    // label) until the user clicks Generate again. Reset so stale
                    // code disappears the moment the language choice no longer matches it.
                    setLang(option);
                    generate.reset();
                  }}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    lang === option
                      ? "bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900"
                      : "text-stone-700 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-900"
                  }`}
                >
                  {option === "ts" ? "TypeScript" : "Python"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => generate.mutate({ lang })}
              disabled={generate.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
            >
              <Code2 className="h-3 w-3" strokeWidth={2} />
              {generate.isPending ? "Generating…" : "Generate starter script"}
            </button>
          </div>
          {generate.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{(generate.error as Error).message}</p>
          )}
          {generate.data?.isStub && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <p>
                Couldn&apos;t generate a real script for this run ({generate.data.stubReason}). Showing an honest
                placeholder instead of fabricated code.
              </p>
            </div>
          )}
          {generate.data && !generate.data.isStub && generate.data.workflowMismatch && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <p>
                The targeted workflow needs a write call, which v1 doesn&apos;t generate real code for yet (GET only).
                This script demonstrates the auth handshake and a basic read call instead, it does not implement that
                workflow.
              </p>
            </div>
          )}
          {generate.data && !generate.data.isStub && (
            <p className="mt-3 text-xs text-stone-500">
              {generate.data.syntaxValidated
                ? `Syntax validated (${lang === "ts" ? "node --check" : "python3 -m py_compile"}) -- not tested against the live API.`
                : `Syntax not validated (${generate.data.syntaxValidationNote ?? "unknown reason"}).`}
            </p>
          )}
          {generate.data && (
            <pre className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs dark:border-stone-800 dark:bg-stone-900">
              <code>{generate.data.code}</code>
            </pre>
          )}
          {generate.data?.envExample && (
            <>
              <p className="mt-3 text-xs font-medium text-stone-500">.env.example</p>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs dark:border-stone-800 dark:bg-stone-900">
                <code>{generate.data.envExample}</code>
              </pre>
            </>
          )}
        </Section>
        <Section id="ide-handoff" title="IDE handoff">
          <p className="mb-3 text-xs text-stone-500">
            Assemble the task, auth handshake, starter script, and known pitfalls into one brief you can paste
            straight into a coding agent (Claude Code, Cursor, etc.) as its task prompt.
          </p>
          {threads && threads.length > 0 && (
            <label className="mb-3 flex items-center gap-2 text-xs text-stone-500">
              Fold in a thread's conversation:
              <select
                value={handoffThreadId}
                onChange={(e) => setHandoffThreadId(e.target.value)}
                className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
              >
                <option value="">None (blueprint only)</option>
                {threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              setCopied(false);
              handoff.mutate({ lang, ...(handoffThreadId ? { threadId: handoffThreadId } : {}) });
            }}
            disabled={handoff.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
          >
            <BrainCircuit className="h-3 w-3" strokeWidth={2} />
            {handoff.isPending ? "Assembling…" : `Generate ${lang === "ts" ? "TypeScript" : "Python"} handoff brief`}
          </button>
          {handoff.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{(handoff.error as Error).message}</p>
          )}
          {handoff.data && (
            <>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-stone-500">
                  {handoff.data.workflowUsed
                    ? `Targeting the "${handoff.data.workflowUsed}" workflow.`
                    : "No named workflow targeted; wired up a basic authenticated read."}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(handoff.data!.markdown);
                    setCopied(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
                >
                  {copied ? (
                    <>
                      <ClipboardCheck className="h-3 w-3" strokeWidth={2} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-3 w-3" strokeWidth={2} />
                      Copy brief
                    </>
                  )}
                </button>
              </div>
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs whitespace-pre-wrap dark:border-stone-800 dark:bg-stone-900">
                <code>{handoff.data.markdown}</code>
              </pre>
            </>
          )}
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
        <Section id="attached-documents" title="Attached documents">
          <p className="mb-3 text-xs text-stone-500">
            Ground chat and handoffs in your own material too, beyond crawled docs: a runbook, a contract, an
            internal spec, or a link to an article. PDF, docx/xlsx/pptx, odt/odp/ods, rtf, csv, md, html, txt, json,
            or yaml, up to 10 MB.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) attachFile.mutate(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachFile.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
            >
              <FileUp className="h-3 w-3" strokeWidth={2} />
              {attachFile.isPending ? "Uploading…" : "Upload a file"}
            </button>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!linkUrl.trim()) return;
                attachLink.mutate(linkUrl.trim(), { onSuccess: () => setLinkUrl("") });
              }}
            >
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-64 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
              />
              <button
                type="submit"
                disabled={attachLink.isPending || !linkUrl.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
              >
                <Link2 className="h-3 w-3" strokeWidth={2} />
                {attachLink.isPending ? "Fetching…" : "Attach link"}
              </button>
            </form>
          </div>
          {(attachFile.isError || attachLink.isError) && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {((attachFile.error ?? attachLink.error) as Error).message}
            </p>
          )}
          {attachedDocs.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {attachedDocs.map((doc) => (
                <li
                  key={doc.sourceUrl}
                  className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-1.5 text-xs dark:border-stone-800"
                >
                  <span className="truncate" title={doc.sourceUrl}>
                    {doc.origin === "link" ? <Link2 className="mr-1.5 inline h-3 w-3" /> : <FileUp className="mr-1.5 inline h-3 w-3" />}
                    {doc.sourceTitle}
                    <span className="ml-1.5 text-stone-400">
                      ({doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDocSource.mutate(doc.sourceUrl)}
                    aria-label={`Remove ${doc.sourceTitle}`}
                    className="shrink-0 rounded p-1 text-stone-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
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
