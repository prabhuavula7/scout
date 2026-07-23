import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, getPool } from "./client.js";

async function main() {
  const db = createDb();
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.log("Migrations complete.");
  await getPool().end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
