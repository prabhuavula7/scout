import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { loadConnectorRegistry, type ConnectorDefinition } from "@scout/connectors";
import { connectorsOverrideDir } from "@scout/store";

export function registerConnectorsCommand(program: Command): void {
  const connectors = program.command("connectors").description("Manage connector definitions (bundled + your own)");

  connectors
    .command("list")
    .description("List bundled and user-added connectors")
    .action(() => {
      const registry = loadConnectorRegistry();
      for (const c of registry) {
        console.log(`${c.slug.padEnd(20)} ${c.implemented ? "verified" : "unverified"}  ${c.name}`);
      }
    });

  connectors
    .command("add")
    .description("Add or override a connector from a JSON file (see the bundled ones in packages/connectors/registry for the shape)")
    .argument("<file>", "path to a connector JSON file")
    .action(async (file: string) => {
      const raw = await fs.readFile(file, "utf-8");
      const parsed = JSON.parse(raw) as ConnectorDefinition;
      if (!parsed.slug || !parsed.name) {
        console.error("Connector JSON must include at least \"slug\" and \"name\".");
        process.exitCode = 1;
        return;
      }
      const dir = connectorsOverrideDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${parsed.slug}.json`), JSON.stringify(parsed, null, 2));
      console.log(`Added "${parsed.slug}" to ${dir}`);
    });
}
