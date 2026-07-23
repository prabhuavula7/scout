import { Worker } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { createDb, DrizzleAgentStore } from "@scout/db";
import { runCoordinator } from "@scout/agents";
import type { ImportRequest } from "@scout/types";

const logger = pino({ transport: { target: "pino-pretty" } });

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

interface ImportPipelineJob {
  platformId: string;
  request: ImportRequest;
  docUrls: string[];
}

const store = new DrizzleAgentStore(createDb());

const worker = new Worker<ImportPipelineJob>(
  "import-pipeline",
  async (job) => {
    logger.info({ jobId: job.id, platformId: job.data.platformId }, "Starting import pipeline");
    await runCoordinator(store, job.data.platformId, job.data.request, job.data.docUrls);
    logger.info({ jobId: job.id, platformId: job.data.platformId }, "Import pipeline complete");
  },
  { connection, concurrency: 2 },
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, "Import pipeline failed");
});

logger.info("IntegrationScout worker listening on queue: import-pipeline");
