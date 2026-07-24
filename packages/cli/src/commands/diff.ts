import { Command } from "commander";
import { diffUnderstanding, hasDrift, type UnderstandingDiff } from "@scout/agents";
import { LocalFileStore } from "@scout/store";

function formatDiff(diff: UnderstandingDiff): string {
  if (!diff.hasPriorSnapshot) {
    return "No prior snapshot to compare against yet -- this run has only ever had one understanding generated. Run `scout refresh` (or wait for `scout watch` to trigger one) and diff again afterward.";
  }
  if (!hasDrift(diff)) {
    return `No drift since ${diff.previousGeneratedAt}: the understanding regenerated (${diff.currentGeneratedAt}) but nothing meaningfully changed.`;
  }

  const lines: string[] = [`Changes since ${diff.previousGeneratedAt} (now ${diff.currentGeneratedAt}):`];
  if (diff.changedNarrativeFields.length > 0) {
    lines.push(`- Narrative changed: ${diff.changedNarrativeFields.join(", ")}`);
  }
  if (diff.workflowsAdded.length > 0) lines.push(`- Workflows added: ${diff.workflowsAdded.join(", ")}`);
  if (diff.workflowsRemoved.length > 0) lines.push(`- Workflows removed: ${diff.workflowsRemoved.join(", ")}`);
  if (diff.dataModelEntitiesAdded.length > 0) lines.push(`- Data model entities added: ${diff.dataModelEntitiesAdded.join(", ")}`);
  if (diff.dataModelEntitiesRemoved.length > 0) lines.push(`- Data model entities removed: ${diff.dataModelEntitiesRemoved.join(", ")}`);
  if (diff.pitfallsAdded.length > 0) lines.push(`- Pitfalls added: ${diff.pitfallsAdded.join(", ")}`);
  if (diff.pitfallsRemoved.length > 0) lines.push(`- Pitfalls removed: ${diff.pitfallsRemoved.join(", ")}`);
  if (diff.integrationOpportunitiesAdded.length > 0) lines.push(`- Integration opportunities added: ${diff.integrationOpportunitiesAdded.join(", ")}`);
  if (diff.integrationOpportunitiesRemoved.length > 0) lines.push(`- Integration opportunities removed: ${diff.integrationOpportunitiesRemoved.join(", ")}`);
  if (diff.securityObservationsAdded.length > 0) lines.push(`- Security observations added: ${diff.securityObservationsAdded.join(", ")}`);
  if (diff.securityObservationsRemoved.length > 0) lines.push(`- Security observations removed: ${diff.securityObservationsRemoved.join(", ")}`);
  return lines.join("\n");
}

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Show what changed in a run's understanding since its last refresh (drift detection)")
    .argument("<slug>", "the run slug, see `scout list`")
    .option("--json", "print the raw diff as JSON instead of a summary")
    .action(async (slug: string, options: { json?: boolean }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store } = opened;
      const understanding = await store.getUnderstanding();
      if (!understanding) {
        console.error(`No understanding generated yet for "${slug}". Run \`scout understand\` first.`);
        process.exitCode = 1;
        return;
      }

      const previous = await store.getPreviousUnderstanding();
      const diff = diffUnderstanding(previous, understanding);

      if (options.json) {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        console.log(formatDiff(diff));
      }
    });
}
