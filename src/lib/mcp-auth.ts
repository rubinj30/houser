const productionSiteUrl = "https://houser-flax.vercel.app";

export function houserSiteUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (requestUrl) return new URL(requestUrl).origin;
  return productionSiteUrl;
}

export function houserMcpResource(requestUrl?: string) {
  return `${houserSiteUrl(requestUrl)}/api/mcp`;
}

export function supabaseAuthorizationServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!url) throw new Error("Houser authentication is not configured.");
  return `${url}/auth/v1`;
}

export function oauthProtectedResourceMetadata(requestUrl?: string) {
  return {
    resource: houserMcpResource(requestUrl),
    authorization_servers: [supabaseAuthorizationServer()],
    scopes_supported: ["openid", "email", "profile"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${houserSiteUrl(requestUrl)}/docs/agent-access`,
  };
}

export function mcpUnauthorizedResponse(requestUrl: string, description = "A valid Houser OAuth access token is required.") {
  const metadataUrl = `${new URL(requestUrl).origin}/.well-known/oauth-protected-resource`;
  return Response.json(
    { error: "unauthorized", error_description: description },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
      },
    },
  );
}
