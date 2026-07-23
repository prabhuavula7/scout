import { cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // Workspace @scout/* packages ship as TS source with no build step of
  // their own (consumed directly via tsx elsewhere in the monorepo); a
  // published CLI needs them inlined into one runnable file instead of
  // left as external imports Node can't resolve on its own.
  noExternal: [/^@scout\//],
  onSuccess: async () => {
    // @scout/connectors reads its bundled registry/*.json files off disk at
    // runtime (relative to its own module location) so adding a connector
    // stays a JSON-only PR, not a code change. Bundling inlines that module
    // into dist/index.js, which breaks the relative path, so copy the JSON
    // files alongside the bundle and let the loader's fallback path find them.
    cpSync(
      path.join(here, "../connectors/registry"),
      path.join(here, "dist/registry"),
      { recursive: true },
    );
  },
});
