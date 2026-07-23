import { z } from "zod";

export const Project = z.object({
  id: z.string().uuid(),
  ownerId: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  isFavorite: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof Project>;

export const CreateProjectRequest = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;
