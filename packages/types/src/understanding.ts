import { z } from "zod";

export const EntityRelationship = z.object({
  from: z.string(),
  to: z.string(),
  relationship: z.string(),
  cardinality: z.enum(["one_to_one", "one_to_many", "many_to_many"]),
});
export type EntityRelationship = z.infer<typeof EntityRelationship>;

export const PlatformUnderstanding = z.object({
  platformId: z.string().uuid(),
  summary: z.string(),
  architectureOverview: z.string(),
  authenticationFlow: z.string(),
  dataModel: z.array(
    z.object({
      entity: z.string(),
      description: z.string(),
      keyFields: z.array(z.string()),
    }),
  ),
  entityRelationships: z.array(EntityRelationship),
  commonWorkflows: z.array(
    z.object({
      name: z.string(),
      steps: z.array(z.string()),
    }),
  ),
  integrationOpportunities: z.array(z.string()),
  potentialPitfalls: z.array(z.string()),
  missingDocumentation: z.array(z.string()),
  securityObservations: z.array(z.string()),
  mermaidSequenceDiagram: z.string(),
  mermaidErDiagram: z.string(),
  citations: z.array(z.string().uuid()),
  generatedAt: z.string().datetime(),
});
export type PlatformUnderstanding = z.infer<typeof PlatformUnderstanding>;
