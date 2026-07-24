import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

    // scout serve ships apps/web's built .next output inside the npm
    // package, and runs it via `next start`. `next`/`react`/`react-dom` are
    // real dependencies of this package (see package.json) rather than
    // pnpm workspace links, so a plain `npm install -g scoutcli` resolves
    // them the normal way, no symlink/standalone-output gymnastics needed;
    // API route handlers are already fully bundled into .next/server/**.js
    // by Next's own webpack build, same as any other Next.js production
    // build, so nothing from packages/agents etc. needs to be re-resolved
    // at runtime here either. Requires apps/web to already be built (see
    // the @scout/web devDependency, which makes turbo build it first).
    const webNext = path.join(here, "../../apps/web/.next");
    const webPublic = path.join(here, "../../apps/web/public");
    const viewerOut = path.join(here, "dist/viewer");

    if (existsSync(webNext)) {
      // cpSync only overwrites files present in the source; it never deletes
      // stale files already in the destination. Without this, anything from
      // a previous local build that's no longer in apps/web/.next (a
      // rotated trace file, a removed route's output) lingers in dist/viewer
      // forever and ships in the published tarball.
      rmSync(viewerOut, { recursive: true, force: true });

      // .next/cache is webpack's build cache (hundreds of MB), never read by
      // `next start`; filtering it out is the difference between a
      // multi-hundred-MB package and one a few MB. .next/trace is Next's own
      // dev-time telemetry log, also unread by `next start`, but capped at
      // 2MB and rotated (trace, trace 2, trace 3, ...) rather than
      // overwritten, so a dev machine with a few builds under its belt can
      // have several stale copies sitting there; exclude all of them too.
      cpSync(webNext, path.join(viewerOut, ".next"), {
        recursive: true,
        filter: (src) =>
          !src.includes(`${path.sep}.next${path.sep}cache${path.sep}`) &&
          !src.endsWith(`${path.sep}.next${path.sep}cache`) &&
          !/[/\\]\.next[/\\]trace( \d+)?$/.test(src),
      });
      if (existsSync(webPublic)) cpSync(webPublic, path.join(viewerOut, "public"), { recursive: true });
      mkdirSync(viewerOut, { recursive: true });
      writeFileSync(path.join(viewerOut, "package.json"), JSON.stringify({ name: "scout-viewer", version: "0.0.0", type: "module" }, null, 2));
    } else {
      console.warn(
        "apps/web/.next not found, scout serve won't work in this build. " +
          "Run `pnpm build` from the repo root (not just this package) to include it.",
      );
    }
  },
});
