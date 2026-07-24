import { Command } from "commander";
import { registerUnderstandCommand } from "./commands/understand.js";
import { registerListCommand } from "./commands/list.js";
import { registerRmCommand } from "./commands/rm.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerExportCommand } from "./commands/export.js";
import { registerConnectorsCommand } from "./commands/connectors.js";
import { registerConfigCommand } from "./commands/config-command.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerWatchCommand } from "./commands/watch.js";
import { registerResearchCommand } from "./commands/research.js";
import { registerMcpCommand } from "./commands/mcp.js";

const program = new Command();

program
  .name("scout")
  .description("Understand any enterprise platform in minutes. Local, no login, no server.")
  .version("1.0.0");

registerUnderstandCommand(program);
registerListCommand(program);
registerRmCommand(program);
registerChatCommand(program);
registerExportCommand(program);
registerConnectorsCommand(program);
registerConfigCommand(program);
registerServeCommand(program);
registerWatchCommand(program);
registerResearchCommand(program);
registerMcpCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
