import { z } from "zod";

export const Resource = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
});
export type Resource = z.infer<typeof Resource>;

export const ResourceSet = z.array(Resource);
export type ResourceSet = z.infer<typeof ResourceSet>;
