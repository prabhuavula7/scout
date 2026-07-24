import type { AuthScheme, Endpoint } from "@scout/types";

function fillPath(path: string, parameters: Endpoint["parameters"]): string {
  return parameters
    .filter((p) => p.in === "path")
    .reduce((acc, p) => acc.replace(`{${p.name}}`, `:${p.name}`), path);
}

/**
 * Auth was previously hardcoded to "Authorization: Bearer $API_TOKEN"
 * regardless of the run's actual detected auth scheme -- fabricating a
 * mechanism that might not exist for this platform. Reflects the real
 * scheme instead, and is honest (a comment, no header) when Scout doesn't
 * have a safe default for it (OAuth2, basic, none, or unrecognized).
 */
interface AuthPlan {
  /** Query string appended to the URL, e.g. "?api_key=$API_KEY"; "" if none. */
  queryString: string;
  /** Header lines (already indented/quoted per-language by the caller). */
  headerName: string | null;
  headerValueCurl: string | null;
  headerValueTs: string | null;
  headerValuePy: string | null;
  /** Set when no safe default exists; callers render a comment instead of a header. */
  unsupportedNote: string | null;
}

function planAuth(authScheme: AuthScheme | null): AuthPlan {
  switch (authScheme) {
    case "bearer_token":
      return {
        queryString: "",
        headerName: "Authorization",
        headerValueCurl: "Bearer $API_TOKEN",
        headerValueTs: "`Bearer ${process.env.API_TOKEN}`",
        headerValuePy: 'f"Bearer {API_TOKEN}"',
        unsupportedNote: null,
      };
    case "api_key_header":
      return {
        queryString: "",
        headerName: "X-API-Key",
        headerValueCurl: "$API_TOKEN",
        headerValueTs: "process.env.API_TOKEN",
        headerValuePy: "API_TOKEN",
        unsupportedNote: null,
      };
    case "api_key_query":
      return {
        queryString: "?api_key=$API_TOKEN",
        headerName: null,
        headerValueCurl: null,
        headerValueTs: null,
        headerValuePy: null,
        unsupportedNote: null,
      };
    default:
      return {
        queryString: "",
        headerName: null,
        headerValueCurl: null,
        headerValueTs: null,
        headerValuePy: null,
        unsupportedNote: `Scout doesn't have a safe default for this platform's auth scheme ("${authScheme ?? "unknown"}"); see the blueprint's Authentication Flow section and adjust manually.`,
      };
  }
}

export function generateCurl(endpoint: Endpoint, baseUrl: string, authScheme: AuthScheme | null = null): string {
  const path = fillPath(endpoint.path, endpoint.parameters);
  const auth = planAuth(authScheme);
  const headerParams = endpoint.parameters.filter((p) => p.in === "header");

  const headers = [
    auth.headerName ? `-H "${auth.headerName}: ${auth.headerValueCurl}"` : null,
    `-H "Content-Type: application/json"`,
    ...headerParams.map((p) => `-H "${p.name}: <${p.name}>"`),
  ]
    .filter((line): line is string => line !== null)
    .join(" \\\n  ");

  const body =
    endpoint.method !== "GET" && endpoint.requestBodySchema
      ? ` \\\n  -d '${JSON.stringify(endpoint.exampleRequest ?? {}, null, 2)}'`
      : "";

  const authComment = auth.unsupportedNote ? `# ${auth.unsupportedNote}\n` : "";

  return `${authComment}curl -X ${endpoint.method} "${baseUrl}${path}${auth.queryString}" \\\n  ${headers}${body}`;
}

export function generateTypeScript(endpoint: Endpoint, baseUrl: string, authScheme: AuthScheme | null = null): string {
  const path = fillPath(endpoint.path, endpoint.parameters);
  const hasBody = endpoint.method !== "GET" && endpoint.requestBodySchema;
  const auth = planAuth(authScheme);

  const authComment = auth.unsupportedNote ? `// ${auth.unsupportedNote}\n` : "";
  const headerLine = auth.headerName ? `\n    "${auth.headerName}": ${auth.headerValueTs},` : "";

  return `${authComment}const response = await fetch("${baseUrl}${path}${auth.queryString}", {
  method: "${endpoint.method}",
  headers: {${headerLine}
    "Content-Type": "application/json",
  },${hasBody ? `\n  body: JSON.stringify(${JSON.stringify(endpoint.exampleRequest ?? {}, null, 2)}),` : ""}
});

const data = await response.json();`;
}

export function generatePython(endpoint: Endpoint, baseUrl: string, authScheme: AuthScheme | null = null): string {
  const path = fillPath(endpoint.path, endpoint.parameters);
  const hasBody = endpoint.method !== "GET" && endpoint.requestBodySchema;
  const auth = planAuth(authScheme);

  const authComment = auth.unsupportedNote ? `# ${auth.unsupportedNote}\n` : "";
  const headersArg = auth.headerName ? `\n    headers={"${auth.headerName}": ${auth.headerValuePy}},` : "";

  return `${authComment}import requests

response = requests.${endpoint.method.toLowerCase()}(
    "${baseUrl}${path}${auth.queryString}",${headersArg}${
      hasBody ? `\n    json=${JSON.stringify(endpoint.exampleRequest ?? {}, null, 2)},` : ""
    }
)

data = response.json()`;
}
