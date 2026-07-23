import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { ImportRequest } from "@integration-scout/types";
import { env } from "./env.js";

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export interface ImportPipelineJob {
  platformId: string;
  request: ImportRequest;
  docUrls: string[];
}

export const importQueue = new Queue<ImportPipelineJob>("import-pipeline", { connection });
