import type { PlatformUnderstanding } from "@scout/types";

export interface UnderstandingDiff {
  hasPriorSnapshot: boolean;
  previousGeneratedAt?: string;
  currentGeneratedAt: string;
  /** Narrative fields (summary, architectureOverview, authenticationFlow) whose text differs. Reports that they changed, not a line-by-line diff. */
  changedNarrativeFields: string[];
  workflowsAdded: string[];
  workflowsRemoved: string[];
  dataModelEntitiesAdded: string[];
  dataModelEntitiesRemoved: string[];
  pitfallsAdded: string[];
  pitfallsRemoved: string[];
  integrationOpportunitiesAdded: string[];
  integrationOpportunitiesRemoved: string[];
  securityObservationsAdded: string[];
  securityObservationsRemoved: string[];
}

function setDiff(previous: string[], current: string[]): { added: string[]; removed: string[] } {
  const prevSet = new Set(previous);
  const currSet = new Set(current);
  return {
    added: current.filter((item) => !prevSet.has(item)),
    removed: previous.filter((item) => !currSet.has(item)),
  };
}

/**
 * Compares the just-regenerated understanding against the snapshot taken
 * right before the most recent refresh (see LocalFileStore.getPreviousUnderstanding),
 * so a `refresh`/`watch` cycle can report *what* changed instead of just
 * silently replacing the understanding. Pure, no I/O -- the CLI/MCP/web
 * layers own reading the two understandings from disk.
 */
export function diffUnderstanding(previous: PlatformUnderstanding | null, current: PlatformUnderstanding): UnderstandingDiff {
  if (!previous) {
    return {
      hasPriorSnapshot: false,
      currentGeneratedAt: current.generatedAt,
      changedNarrativeFields: [],
      workflowsAdded: [],
      workflowsRemoved: [],
      dataModelEntitiesAdded: [],
      dataModelEntitiesRemoved: [],
      pitfallsAdded: [],
      pitfallsRemoved: [],
      integrationOpportunitiesAdded: [],
      integrationOpportunitiesRemoved: [],
      securityObservationsAdded: [],
      securityObservationsRemoved: [],
    };
  }

  const changedNarrativeFields = (
    [
      ["summary", previous.summary, current.summary],
      ["architectureOverview", previous.architectureOverview, current.architectureOverview],
      ["authenticationFlow", previous.authenticationFlow, current.authenticationFlow],
    ] as const
  )
    .filter(([, before, after]) => before !== after)
    .map(([field]) => field);

  const workflows = setDiff(
    previous.commonWorkflows.map((w) => w.name),
    current.commonWorkflows.map((w) => w.name),
  );
  const dataModel = setDiff(
    previous.dataModel.map((d) => d.entity),
    current.dataModel.map((d) => d.entity),
  );
  const pitfalls = setDiff(previous.potentialPitfalls, current.potentialPitfalls);
  const integrationOpportunities = setDiff(previous.integrationOpportunities, current.integrationOpportunities);
  const securityObservations = setDiff(previous.securityObservations, current.securityObservations);

  return {
    hasPriorSnapshot: true,
    previousGeneratedAt: previous.generatedAt,
    currentGeneratedAt: current.generatedAt,
    changedNarrativeFields,
    workflowsAdded: workflows.added,
    workflowsRemoved: workflows.removed,
    dataModelEntitiesAdded: dataModel.added,
    dataModelEntitiesRemoved: dataModel.removed,
    pitfallsAdded: pitfalls.added,
    pitfallsRemoved: pitfalls.removed,
    integrationOpportunitiesAdded: integrationOpportunities.added,
    integrationOpportunitiesRemoved: integrationOpportunities.removed,
    securityObservationsAdded: securityObservations.added,
    securityObservationsRemoved: securityObservations.removed,
  };
}

/** True iff the diff found any actual difference (used to short-circuit "nothing changed" messaging). */
export function hasDrift(diff: UnderstandingDiff): boolean {
  return (
    diff.changedNarrativeFields.length > 0 ||
    diff.workflowsAdded.length > 0 ||
    diff.workflowsRemoved.length > 0 ||
    diff.dataModelEntitiesAdded.length > 0 ||
    diff.dataModelEntitiesRemoved.length > 0 ||
    diff.pitfallsAdded.length > 0 ||
    diff.pitfallsRemoved.length > 0 ||
    diff.integrationOpportunitiesAdded.length > 0 ||
    diff.integrationOpportunitiesRemoved.length > 0 ||
    diff.securityObservationsAdded.length > 0 ||
    diff.securityObservationsRemoved.length > 0
  );
}
