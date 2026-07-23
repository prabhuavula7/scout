import os from "node:os";
import path from "node:path";

/**
 * Root directory for all local Scout data. Overridable via SCOUT_HOME for
 * tests and for anyone who wants runs stored somewhere other than the
 * default (e.g. inside a project directory instead of the user's home).
 */
export function scoutHome(): string {
  return process.env.SCOUT_HOME ?? path.join(os.homedir(), ".scout");
}

export function runsRoot(): string {
  return path.join(scoutHome(), "runs");
}

export function connectorsOverrideDir(): string {
  return path.join(scoutHome(), "connectors");
}

export function configPath(): string {
  return path.join(scoutHome(), "config.json");
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "platform"
  );
}

export function runDir(slug: string): string {
  return path.join(runsRoot(), slug);
}

export function historyDir(slug: string): string {
  return path.join(runDir(slug), "history");
}
