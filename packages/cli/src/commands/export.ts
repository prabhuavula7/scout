import { Command } from "commander";
import { LocalFileStore } from "@scout/store";
import type { Resource } from "@scout/types";

function toMarkdown(
  name: string,
  understanding: NonNullable<Awaited<ReturnType<LocalFileStore["getUnderstanding"]>>>,
  resources: Resource[],
): string {
  const lines: string[] = [
    `# ${name}`,
    "",
    understanding.summary,
    "",
    "## Architecture overview",
    understanding.architectureOverview,
    "",
    "## Authentication flow",
    understanding.authenticationFlow,
    "",
    "## Data model",
    ...understanding.dataModel.map((d) => `- **${d.entity}**: ${d.description} (${d.keyFields.join(", ")})`),
    "",
    "## Common workflows",
    ...understanding.commonWorkflows.map((w) => `### ${w.name}\n${w.steps.map((s) => `1. ${s}`).join("\n")}`),
    "",
    "## Integration opportunities",
    ...understanding.integrationOpportunities.map((o) => `- ${o}`),
    "",
    "## Potential pitfalls",
    ...understanding.potentialPitfalls.map((p) => `- ${p}`),
    "",
    "## Missing documentation",
    ...understanding.missingDocumentation.map((m) => `- ${m}`),
    "",
    "## Security observations",
    ...understanding.securityObservations.map((s) => `- ${s}`),
    "",
    "## Sequence diagram",
    "```mermaid",
    understanding.mermaidSequenceDiagram,
    "```",
    "",
    "## Entity relationship diagram",
    "```mermaid",
    understanding.mermaidErDiagram,
    "```",
    ...(resources.length > 0
      ? ["", "## Further reading", ...resources.map((r) => `- [${r.title}](${r.url}): ${r.snippet}`)]
      : []),
  ];
  return lines.join("\n");
}

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export a platform's understanding as Markdown or JSON")
    .argument("<slug>", "the run slug, see `scout list`")
    .option("--format <format>", "md or json", "md")
    .action(async (slug: string, options: { format: string }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store } = opened;
      const understanding = await store.getUnderstanding();
      if (!understanding) {
        console.error(`No understanding generated yet for "${slug}".`);
        process.exitCode = 1;
        return;
      }

      const platform = await store.getPlatform();
      const resources = await store.getResources();
      if (options.format === "json") {
        console.log(JSON.stringify({ ...understanding, resources }, null, 2));
      } else {
        console.log(toMarkdown(platform.name, understanding, resources));
      }
    });
}
