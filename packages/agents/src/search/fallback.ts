import type { Resource } from "@scout/types";
import type { SearchProvider } from "./provider.js";

export class FallbackSearchProvider implements SearchProvider {
  readonly name: string;

  constructor(private readonly providers: SearchProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackSearchProvider requires at least one underlying provider.");
    }
    this.name = providers.map((p) => p.name).join(" -> ");
  }

  async search(query: string, maxResults: number): Promise<Resource[]> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.search(query, maxResults);
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`All search providers failed:\n${errors.join("\n")}`);
  }
}
