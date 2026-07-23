import type { Endpoint } from "@scout/types";

function fillPath(path: string, parameters: Endpoint["parameters"]): string {
  return parameters
    .filter((p) => p.in === "path")
    .reduce((acc, p) => acc.replace(`{${p.name}}`, `:${p.name}`), path);
}

export function generateCurl(endpoint: Endpoint, baseUrl: string): string {
  const path = fillPath(endpoint.path, endpoint.parameters);
  const headerParams = endpoint.parameters.filter((p) => p.in === "header");
  const headers = [
    `-H "Authorization: Bearer $API_TOKEN"`,
    `-H "Content-Type: application/json"`,
    ...headerParams.map((p) => `-H "${p.name}: <${p.name}>"`),
  ].join(" \\\n  ");

  const body =
    endpoint.method !== "GET" && endpoint.requestBodySchema
      ? ` \\\n  -d '${JSON.stringify(endpoint.exampleRequest ?? {}, null, 2)}'`
      : "";

  return `curl -X ${endpoint.method} "${baseUrl}${path}" \\\n  ${headers}${body}`;
}

export function generateTypeScript(endpoint: Endpoint, baseUrl: string): string {
  const path = fillPath(endpoint.path, endpoint.parameters);
  const hasBody = endpoint.method !== "GET" && endpoint.requestBodySchema;

  return `const response = await fetch("${baseUrl}${path}", {
  method: "${endpoint.method}",
  headers: {
    Authorization: \`Bearer \${process.env.API_TOKEN}\`,
    "Content-Type": "application/json",
  },${hasBody ? `\n  body: JSON.stringify(${JSON.stringify(endpoint.exampleRequest ?? {}, null, 2)}),` : ""}
});

const data = await response.json();`;
}

export function generatePython(endpoint: Endpoint, baseUrl: string): string {
  const path = fillPath(endpoint.path, endpoint.parameters);
  const hasBody = endpoint.method !== "GET" && endpoint.requestBodySchema;

  return `import requests

response = requests.${endpoint.method.toLowerCase()}(
    "${baseUrl}${path}",
    headers={"Authorization": f"Bearer {API_TOKEN}"},${
      hasBody ? `\n    json=${JSON.stringify(endpoint.exampleRequest ?? {}, null, 2)},` : ""
    }
)

data = response.json()`;
}
