export type ConnectorCategory =
  | "cms"
  | "dam"
  | "workflow"
  | "knowledge"
  | "storage"
  | "crm"
  | "communication";

export interface ConnectorDefinition {
  slug: string;
  name: string;
  category: ConnectorCategory;
  /** Whether IntegrationScout has a working import/crawl path wired up for this connector. */
  implemented: boolean;
  /** Suggested docs entry point to speed up the Import flow. Left null when we're not confident of a stable URL. */
  suggestedDocsUrl: string | null;
  defaultAuthScheme: "api_key_header" | "bearer_token" | "oauth2" | "basic" | "none";
  description: string;
}

/**
 * Seed registry of enterprise platforms relevant to a CMS/DAM-centric
 * integration practice (Contentful is the fully implemented reference
 * connector; the rest are declared so the picker reflects the real target
 * landscape, but they are NOT wired up yet (see ROADMAP.md).
 */
export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [
  {
    slug: "contentful",
    name: "Contentful",
    category: "cms",
    implemented: true,
    suggestedDocsUrl: "https://www.contentful.com/developers/docs/",
    defaultAuthScheme: "bearer_token",
    description: "Headless CMS. Content Delivery, Management, and Preview APIs.",
  },
  { slug: "sanity", name: "Sanity", category: "cms", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "bearer_token", description: "Headless CMS with GROQ query language." },
  { slug: "wordpress", name: "WordPress", category: "cms", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "basic", description: "WordPress REST API." },
  { slug: "aem", name: "Adobe Experience Manager", category: "cms", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Enterprise CMS and DXP." },
  { slug: "bynder", name: "Bynder", category: "dam", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Digital asset management platform." },
  { slug: "cloudinary", name: "Cloudinary", category: "dam", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "api_key_header", description: "Media management and optimization." },
  { slug: "cloudflare-images", name: "Cloudflare Images", category: "dam", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "bearer_token", description: "Image storage, resizing, and delivery." },
  { slug: "jira", name: "Jira", category: "workflow", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Issue tracking and project workflow." },
  { slug: "asana", name: "Asana", category: "workflow", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "bearer_token", description: "Work management platform." },
  { slug: "monday", name: "Monday.com", category: "workflow", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "bearer_token", description: "Work OS / project workflows." },
  { slug: "notion", name: "Notion", category: "knowledge", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "bearer_token", description: "Docs, wikis, and databases." },
  { slug: "confluence", name: "Confluence", category: "knowledge", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Team knowledge base and wiki." },
  { slug: "google-drive", name: "Google Drive", category: "storage", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "File storage and collaboration." },
  { slug: "sharepoint", name: "SharePoint", category: "storage", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Enterprise document management." },
  { slug: "dropbox", name: "Dropbox", category: "storage", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Cloud file storage." },
  { slug: "hubspot", name: "HubSpot", category: "crm", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "bearer_token", description: "CRM, marketing, and CMS platform." },
  { slug: "salesforce", name: "Salesforce", category: "crm", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Enterprise CRM platform." },
  { slug: "slack", name: "Slack", category: "communication", implemented: false, suggestedDocsUrl: null, defaultAuthScheme: "oauth2", description: "Team messaging and workflow automation." },
];

export function getConnector(slug: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.slug === slug);
}
